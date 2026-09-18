#!/bin/bash
echo "BUILD:" > pr_body.txt
npm run build >> pr_body.txt 2>&1
echo -e "\nTEST:" >> pr_body.txt
npm run test >> pr_body.txt 2>&1
echo -e "\nLINT:" >> pr_body.txt
npm run lint >> pr_body.txt 2>&1

cat pr_body.txt
