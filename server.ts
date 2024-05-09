// deno-lint-ignore-file no-explicit-any no-unused-vars

const {
  build,
  version,
  env: environment,
  args: deno_args,
  readTextFile,
} = Deno;
console.log({ build, version });

// ----------------------------------------------------------
// ----------------------------------------------------------

import { Status } from "https://deno.land/std@0.148.0/http/http_status.ts";
import { contentType } from "https://deno.land/std@0.153.0/media_types/mod.ts";
import { parse } from "https://deno.land/std@0.200.0/flags/mod.ts";
import { MongoClient } from "https://deno.land/x/mongo@v0.32.0/mod.ts";

import assets from "./assets.ts";

// ----------------------------------------------------------
// ----------------------------------------------------------

async function fileExist(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

// ----------------------------------------------------------
// ----------------------------------------------------------

const isEnvExist = await fileExist(".env");
if (isEnvExist) {
  const data = await readTextFile(".env");
  for (const line of data.split("\n")) {
    const [key, value] = line.split("=");
    if (key && value) environment.set(key.trim(), value.trim());
  }
  console.log("✅ .env file loaded!");
} else {
  console.log("❌ no .env file...");
}

// ----------------------------------------------------------
// ----------------------------------------------------------

const cors_header: Record<string, any> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "*",
  "Access-Control-Allow-Credentials": true,
};

const env = environment.toObject();
const args = parse(deno_args);

const isDebug = args["debug"] || env["DEBUG"] == "true" || false;

const ENVIRONMENT = args["environment"] || env["ENVIRONMENT"] || "development";
const isProduction = String(ENVIRONMENT).toLowerCase() == "production";
const SECRET_KEY = args["secret-key"] || env["SECRET_KEY"] || "s3cr3t_key";

const PORT = parseInt(args["port"] || env["PORT"] || 1234) || 1234;
const WORKER = parseInt(args["worker"] || env["WORKER"] || 1) || 1;

let MONGO_URL = "mongodb://localhost:27017/";
MONGO_URL =
  args["mongo-url"] ||
  (env["MONGO_URL"] != "" ? env["MONGO_URL"] : MONGO_URL) ||
  MONGO_URL;
let MONGO_NAME = "app";
MONGO_NAME =
  args["mongo-name"] ||
  (env["MONGO_NAME"] != "" ? env["MONGO_NAME"] : MONGO_NAME) ||
  MONGO_NAME;

// replace all to default...
for (const key in env) {
  if (key == "DEBUG") {
    env[key] = isDebug;
  }
  if (key == "ENVIRONMENT") {
    env[key] = ENVIRONMENT;
  }
  if (key == "SECRET_KEY") {
    env[key] = SECRET_KEY;
  }
  if (key == "PORT") {
    env[key] = PORT.toString();
  }
  if (key == "WORKER") {
    env[key] = WORKER.toString();
  }
  if (key == "MONGO_URL") {
    env[key] = MONGO_URL;
  }
  if (key == "MONGO_NAME") {
    env[key] = MONGO_NAME;
  }
}

// ----------------------------------------------------------
// ----------------------------------------------------------

const client = new MongoClient();
try {
  await client.connect(MONGO_URL);
  let target_url: any = String(MONGO_URL).split("@");
  if (target_url.length == 2) {
    target_url = target_url[1];
  } else {
    target_url = target_url[0];
  }
  console.log(`✅ MongoDB Connected on ${target_url} => ${MONGO_NAME}`);
} catch (error) {
  Deno.exit(0);
}
const database = client.database(MONGO_NAME);

const variablesCollection = database.collection("variables");
const routesCollection = database.collection("routes");
const middlewaresCollection = database.collection("middlewares");

// ----------------------------------------------------------
// ----------------------------------------------------------

const backend_endpoint = {
  ping: "/ping",
  init: "/init",
  api: "/api",
};

// ----------------------------------------------------------
// ----------------------------------------------------------

Deno.serve({ port: PORT }, async (request) => {
  const request_id: string = crypto.randomUUID();
  // console.log({ request_id });

  const response_headers: Record<string, any> = {
    ...cors_header,
    "X-Request-ID": request_id,
  };

  // ==========================================================================================

  const host: string = request.headers.get("host") || "localhost";
  const url: URL = new URL(request.url, `https://${host}`);
  let endpoint: string = url.pathname.replace(/\/+$/, "");
  endpoint = endpoint == "" ? "/" : endpoint;
  const method: string = request.method;

  // ==========================================================================================

  // frontend management...
  let statusCode = Status.OK; // 200

  if (
    method == "GET" &&
    !Object.values(backend_endpoint).some((value) =>
      String(endpoint).startsWith(value)
    )
  ) {
    const asset_files: any = assets.files;
    let endpoint_selected = endpoint;
    if (endpoint_selected == "/") {
      endpoint_selected = "/index.html";
    }
    let asset = asset_files[endpoint_selected];
    if (!asset) {
      asset = asset_files["/index.html"];
      statusCode = Status.NotFound;
    }
    const content: string = asset.content;
    const extension: string = asset.extension;
    let content_type: string = contentType(extension) || "text/plain";
    content_type = content_type.split(";")[0];
    return new Response(content, {
      status: statusCode,
      headers: {
        ...response_headers,
        "Content-Type": content_type,
      },
    });
  }

  // ==========================================================================================

  // backend management...
  statusCode = Status.Accepted; // 202

  const req: any = {
    request_id,
    build,
    version,
    env,

    host,
    url,
    endpoint,
    method,
  };
  let response: any = {};
  // console.log({ req });

  if (method === "OPTIONS") {
    return new Response("OK", {
      status: Status.OK,
      headers: {
        ...response_headers,
        "Content-Type": "plain/text",
      },
    });
  }

  try {
    if (endpoint == backend_endpoint.ping) {
      const ipify = await fetch("https://api.ipify.org/?format=json");
      const { ip } = await ipify.json();
      response = {
        ip,
      };
    } else if (String(endpoint).startsWith(backend_endpoint.init)) {
      if (method == "GET") {
        let middlewares = await middlewaresCollection
          .find({
            for: "FE",
          })
          .toArray();
        middlewares = middlewares.map((middleware) => {
          delete middleware["_id"];
          delete middleware["for"];
          return middleware;
        });
        let routes = await routesCollection
          .find({
            for: "FE",
          })
          .toArray();
        routes = routes.map((route) => {
          delete route["_id"];
          delete route["for"];
          return route;
        });
        const variable = await variablesCollection.findOne({
          key: "version",
        });
        let version = "";
        if (variable) {
          version = variable.value;
        }
        response = {
          version,
          middlewares,
          routes,
        };
      }
    } else if (String(endpoint).startsWith(backend_endpoint.api)) {
      response = {};
    }

    // endpoint not found...
    if (Object.keys(response).length == 0) {
      statusCode = Status.NotFound;
      response = {
        message: "endpoint not found",
      };
    }

    // ==========================================================================================

    return Response.json(response, {
      status: statusCode,
      headers: {
        ...response_headers,
      },
    });
  } catch (error) {
    return Response.json(
      {
        message: "internal server error",
      },
      {
        status: Status.InternalServerError,
        headers: {
          ...response_headers,
        },
      }
    );
  }
});
