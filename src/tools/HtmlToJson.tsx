import React, { useEffect, useState } from "react";

// @ts-ignore
import { HTMLToJSON } from "html-to-json-parser";

function HtmlToJson(): JSX.Element {
  const [source, setSource] = useState<string>("");
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (source == "") {
        setResult("");
        return;
      }
      let result = await HTMLToJSON(source, false);
      console.log(0, { result });
      result = JSON.stringify(result, null, 2);
      console.log(1, { result });
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
        <div className="form-group">
          <label htmlFor="textarea-source">Source</label>
          <textarea
            className="form-control"
            id="textarea-source"
            rows={3}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          ></textarea>
        </div>
      </div>
      <div className="col-6">
        <div className="form-group">
          <label htmlFor="textarea-result">Result</label>
          <textarea
            className="form-control"
            id="textarea-result"
            rows={3}
            value={result}
            onChange={(e) => setSource(e.target.value)}
          ></textarea>
        </div>
      </div>
    </div>
  );
}

export default HtmlToJson;
