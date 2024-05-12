import { minify } from "html-minifier";
import * as fs from "node:fs";

const html_target = "./dist/index.html";

const data = fs.readFileSync(html_target, "utf8");
const min = minify(data, {
  collapseWhitespace: true,
  removeAttributeQuotes: true,
  collapseInlineTagWhitespace: true,
  minifyCSS: true,
  minifyJS: true,
  minifyURLs: true,
  removeComments: true,
});
fs.writeFileSync(html_target, min);
