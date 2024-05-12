#!/bin/bash

npm install html-minifier-terser -g
html-minifier-terser --collapse-whitespace --remove-comments --minify-js true -o ./dist/index.html ./dist/index.html
