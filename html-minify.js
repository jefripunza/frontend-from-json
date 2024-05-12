import { minifyHTML } from "https://deno.land/x/minifier/mod.ts";
import * as fs from "node:fs";

const html_target = "./dist/index.html";

const data = fs.readFileSync(html_target, "utf8");
const min = minifyHTML(data, {
  minifyCSS: true,
  minifyJS: true,
});

const html_output = html_target;
// const html_output = "./result.html";
fs.writeFileSync(html_output, min);
