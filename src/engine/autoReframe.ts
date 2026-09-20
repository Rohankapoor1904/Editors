import { Point, Transform, Keyframe } from '../types/timeline';
import { secondsToRational } from '../types/time';

export interface ReframeCropWindow {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  targetAspect: number; // e.g. 9/16 = 0.5625
}

export interface KeyframedCropWindow extends ReframeCropWindow {
  frameIndex: number;
  timestamp: number;
  subjectCenterX: number;
}

class KalmanFilter1D {
  private x: number; // Position
  private v: number; // Velocity
  private P: number[][]; // Covariance matrix (2x2)
  private Q: number[][]; // Process noise covariance (2x2)
  private R: number; // Measurement noise covariance (1x1)

  constructor(initialX: number) {
    this.x = initialX;
    this.v = 0;

    // Initial covariance
    this.P = [
      [10, 0],
      [0, 10]
    ];

    // Process noise (assumes some variance in acceleration)
    // Adjust these to tune smoothing vs responsiveness
    this.Q = [
      [1, 0],
      [0, 3]
    ];

    // Measurement noise (high means we trust the prediction more -> smoother)
    this.R = 500;
  }

  predict(dt: number) {
    // State transition model: x_new = x + v * dt, v_new = v
    this.x = this.x + this.v * dt;

    // Covariance update: P = F * P * F^T + Q
    // F = [[1, dt], [0, 1]]
    const P00 = this.P[0][0] + dt * this.P[1][0] + dt * (this.P[0][1] + dt * this.P[1][1]) + this.Q[0][0];
    const P01 = this.P[0][1] + dt * this.P[1][1] + this.Q[0][1];
    const P10 = this.P[1][0] + dt * this.P[1][1] + this.Q[1][0];
    const P11 = this.P[1][1] + this.Q[1][1];

    this.P = [
      [P00, P01],
      [P10, P11]
    ];
  }

  update(measurementX: number) {
    // Measurement matrix H = [1, 0]
    // y = z - H * x (innovation)
    const y = measurementX - this.x;

    // S = H * P * H^T + R
    const S = this.P[0][0] + this.R;

    // Kalman gain K = P * H^T / S
    const K = [
      this.P[0][0] / S,
      this.P[1][0] / S
    ];

    // State update
    this.x = this.x + K[0] * y;
    this.v = this.v + K[1] * y;

    // Covariance update P = (I - K * H) * P
    const P00 = (1 - K[0]) * this.P[0][0];
    const P01 = (1 - K[0]) * this.P[0][1];
    const P10 = -K[1] * this.P[0][0] + this.P[1][0];
    const P11 = -K[1] * this.P[0][1] + this.P[1][1];

    this.P = [
      [P00, P01],
      [P10, P11]
    ];
  }

  getState() {
    return this.x;
  }
}

export class AutoReframeEngine {
  /**
   * Calculates optimal crop window to maintain subject in frame during 16:9 to 9:16 re-aspecting
   * Enforces that the actual subject falls inside the calculated crop window.
   */
  calculateCropWindow(
    smoothedSubjectCenterX: number,
    sourceWidth: number,
    sourceHeight: number,
    targetAspect = 9 / 16,
    actualSubjectX?: number
  ): ReframeCropWindow {
    const cropWidth = sourceHeight * targetAspect;
    const cropHeight = sourceHeight;

    // Clamp center X within source bounds initially based on smoothed trajectory
    let cropX = smoothedSubjectCenterX - cropWidth / 2;

    // Strict acceptance criteria constraint: 16:9→9:16 output keeps the subject inside the crop window for every frame
    if (actualSubjectX !== undefined) {
      if (actualSubjectX < cropX) {
        // Subject is too far left, move crop window left
        cropX = actualSubjectX;
      } else if (actualSubjectX > cropX + cropWidth) {
        // Subject is too far right, move crop window right
        cropX = actualSubjectX - cropWidth;
      }
    }

    // Final clamp to ensure crop window never exceeds source boundaries
    cropX = Math.max(0, Math.min(sourceWidth - cropWidth, cropX));

    return {
      cropX,
      cropY: 0,
      cropWidth,
      cropHeight,
      targetAspect,
    };
  }

  /**
   * Generates keyframed crop windows with Kalman filter motion smoothing to avoid jittery camera pans
   */
  calculateSmoothReframeTrajectory(
    subjectTrajectory: { frameIndex: number; timestamp: number; subjectCenterX: number }[],
    sourceWidth: number,
    sourceHeight: number,
    targetAspect = 9 / 16
  ): KeyframedCropWindow[] {
    const result: KeyframedCropWindow[] = [];
    if (subjectTrajectory.length === 0) return result;

    const kf = new KalmanFilter1D(subjectTrajectory[0].subjectCenterX);
    let previousTime = subjectTrajectory[0].timestamp;

    for (const point of subjectTrajectory) {
      let dt = point.timestamp - previousTime;
      // Handle the first frame or multiple points with the same timestamp
      if (dt <= 0) {
        dt = 1 / 60; // Assume 60fps fallback dt if no valid delta exists
      }

      // 1. Predict
      kf.predict(dt);

      // 2. Update with noisy measurement
      kf.update(point.subjectCenterX);

      const smoothedX = kf.getState();

      const rawCrop = this.calculateCropWindow(
        smoothedX,
        sourceWidth,
        sourceHeight,
        targetAspect,
        point.subjectCenterX
      );

      result.push({
        ...rawCrop,
        frameIndex: point.frameIndex,
        timestamp: point.timestamp,
        subjectCenterX: point.subjectCenterX,
      });

      previousTime = point.timestamp;
    }

    return result;
  }

  /**
   * Generates full Transform scale and Position X keyframes for 16:9 -> 9:16 re-aspecting
   * applying Kalman-filtered trajectory smoothing.
   */
  generateAutoReframeKeyframes(
    sourceWidth: number,
    sourceHeight: number,
    durationSeconds: number,
    targetAspect = 9 / 16,
    subjectTrajectory?: { frameIndex: number; timestamp: number; subjectCenterX: number }[]
  ): {
    scale: Point;
    positionKeyframes: Keyframe[];
    initialTransform: Transform;
  } {
    const cropWidth = sourceHeight * targetAspect;
    const scaleFactor = sourceWidth / cropWidth;

    // Use provided trajectory or generate stable center-weighted anchor points
    let trajectory = subjectTrajectory;
    if (!trajectory || trajectory.length === 0) {
      const step = Math.max(0.5, durationSeconds / 10);
      const points: { frameIndex: number; timestamp: number; subjectCenterX: number }[] = [];
      let frameIdx = 0;
      for (let t = 0; t <= durationSeconds; t += step) {
        points.push({
          frameIndex: frameIdx++,
          timestamp: t,
          subjectCenterX: sourceWidth / 2,
        });
      }
      trajectory = points;
    }

    const smoothedCrops = this.calculateSmoothReframeTrajectory(
      trajectory,
      sourceWidth,
      sourceHeight,
      targetAspect
    );

    const positionKeyframes: Keyframe[] = smoothedCrops.map((crop) => {
      const cropCenterX = crop.cropX + crop.cropWidth / 2;
      const normCenterX = cropCenterX / sourceWidth;
      // When normCenterX is 0.5 (center), position.x is 0.5.
      // When normCenterX shifts left, position.x shifts right to center the crop in viewer.
      const positionX = 0.5 + (0.5 - normCenterX) * (scaleFactor - 1.0);

      return {
        time: secondsToRational(crop.timestamp),
        value: positionX,
        easing: 'easeInOut',
      };
    });

    const initialX = positionKeyframes.length > 0 ? positionKeyframes[0].value : 0.5;

    const initialTransform: Transform = {
      position: { x: initialX, y: 0.5 },
      scale: { x: scaleFactor, y: scaleFactor },
      rotation: 0,
      opacity: 1,
      anchorPoint: { x: 0.5, y: 0.5 },
    };

    return {
      scale: { x: scaleFactor, y: scaleFactor },
      positionKeyframes,
      initialTransform,
    };
  }
}

export const autoReframeEngine = new AutoReframeEngine();

