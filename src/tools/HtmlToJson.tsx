import { useEffect, useState } from "react";

// @ts-ignore
import { HTMLToJSON } from "html-to-json-parser";
import Editor from "@monaco-editor/react";

function HtmlToJson(): JSX.Element {
  const [source, setSource] = useState<string>("");
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (source == "") {
        setResult("");
        return;
      }
      // const minifierOptions = {
      //   collapseWhitespace: true,
      //   removeComments: true,
      //   removeRedundantAttributes: true,
      //   removeEmptyAttributes: true,
      //   minifyJS: true,
      //   minifyCSS: true,
      // };
      const minifiedHtml = source
        .replace(/[\n\r]+|[\s]{2,}/g, "") // Hapus baris baru dan spasi berlebihan
        .replace(/<!--[\s\S]*?-->/g, "") // Hapus komentar HTML
        .trim();
      let result = await HTMLToJSON(minifiedHtml, false);
      result = JSON.stringify(result, null, 2);
      result = String(result)
        .replace(/"type"/g, '"element"')
        .replace(/"content"/g, '"children"');
      console.log(2, { result });
      setResult(result);
    })();
  }, [source]);

  return (
    <div className="row pt-3 px-3">
      <div className="col-6">
        <Editor
          theme="vs-dark"
          height="90vh"
          defaultLanguage="html"
          defaultValue={'<div class="container"></div>'}
          value={source}
          onChange={(value) => setSource(value || "")}
        />
      </div>
      <div className="col-6">
        <Editor
          theme="vs-dark"
          height="90vh"
          defaultLanguage="json"
          defaultValue={JSON.stringify(
            {
              element: "div",
              attributes: { class: "container" },
            },
            null,
            2
          )}
          value={result}
          onChange={(value) => setSource(value || "")}
        />
      </div>
    </div>
  );
}

export default HtmlToJson;
