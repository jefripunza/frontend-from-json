// deno-lint-ignore-file no-explicit-any no-unused-vars

const {
  build,
  version,
  env: environment,
  args: deno_args,
  readTextFile,
} = Deno;
console.log({ build, version });

interface IObject<T> {
  [key: string]: T
}

// ----------------------------------------------------------
// ----------------------------------------------------------

import * as base64 from "https://deno.land/std@0.207.0/encoding/base64.ts";
// @deno-types="npm:@types/crypto-js@4.2.2"
import CryptoJS from "npm:crypto-js@4.2.0";

import { Status } from "https://deno.land/std@0.148.0/http/http_status.ts";
import { contentType } from "https://deno.land/std@0.153.0/media_types/mod.ts";
import { parse } from "https://deno.land/std@0.200.0/flags/mod.ts";
import { MongoClient } from "https://deno.land/x/mongo@v0.32.0/mod.ts";

import assets from "./assets.ts";

// ----------------------------------------------------------
// ----------------------------------------------------------

function hashKey(key: string) {
  return CryptoJS.SHA256(key).toString(CryptoJS.enc.Hex);
}
function reverseStrings(text: string) {
  return String(text).split("").reverse().join("");
}

function encryptMethod(key: string, plaintext: string) {
  // return CryptoJS.AES.encrypt(plaintext, key).toString();
  return CryptoJS.TripleDES.encrypt(plaintext, key).toString();
}
function decryptMethod(key: string, cipher_text: string) {
  // return CryptoJS.AES.decrypt(cipher_text, key).toString(CryptoJS.enc.Utf8);
  return CryptoJS.TripleDES.decrypt(cipher_text, key).toString(
    CryptoJS.enc.Utf8
  );
}

function encode(secret_key: string, text: string) {
  const key = hashKey(secret_key);

  // Layer 1: AES Encryption with original hashed key
  let cipher_text = encryptMethod(key, text);

  // Layer 2: AES Encryption with reversed hashed key
  const reversedKey = reverseStrings(key);
  cipher_text = encryptMethod(reversedKey, cipher_text);

  // Layer 3: AES Encryption with first half of the original hashed key rehashed
  const firstHalfKey = hashKey(key.substring(0, key.length / 2));
  cipher_text = encryptMethod(firstHalfKey, cipher_text);

  // Layer 4: AES Encryption with second half of the original hashed key rehashed
  const secondHalfKey = hashKey(key.substring(key.length / 2));
  cipher_text = encryptMethod(secondHalfKey, cipher_text);

  // Layer 5: Base64 Encoding
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(cipher_text));
}
function decode(secret_key: string, encoded_text: string) {
  const key = hashKey(secret_key);

  // Layer 5: Base64 Decoding
  const decodedText = CryptoJS.enc.Base64.parse(encoded_text).toString(
    CryptoJS.enc.Utf8
  );

  // Layer 4: AES Decryption with second half of the original hashed key rehashed
  let plaintext = decryptMethod(
    hashKey(key.substring(key.length / 2)),
    decodedText
  );

  // Layer 3: AES Decryption with first half of the original hashed key rehashed
  plaintext = decryptMethod(
    hashKey(key.substring(0, key.length / 2)),
    plaintext
  );

  // Layer 2: AES Decryption with reversed hashed key
  const reversedKey = reverseStrings(key);
  plaintext = decryptMethod(reversedKey, plaintext);

  // Layer 1: AES Decryption with original hashed key
  plaintext = decryptMethod(key, plaintext);

  return plaintext;
}

// ------------------------------------------------------------------------

function convertSize(size: number) {
  let unit = "";
  let value: number | string = 0;
  const fix = 2;

  if (size < 1024) {
    value = size;
    unit = "B";
  } else if (size < 1024 * 1024) {
    value = (size / 1024).toFixed(fix);
    unit = "KB";
  } else if (size < 1024 * 1024 * 1024) {
    value = (size / (1024 * 1024)).toFixed(fix);
    unit = "MB";
  } else {
    value = (size / (1024 * 1024 * 1024)).toFixed(fix);
    unit = "GB";
  }

  return { value: parseFloat(value as string), unit };
}
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

// frontend...
const variablesCollection = database.collection("variables");
const routesCollection = database.collection("routes");
const middlewaresCollection = database.collection("middlewares");

// backend...
interface IBrowser {
  key: string;
  userAgent: string;
  blocked?: boolean;
}
const browsersCollection = database.collection<IBrowser>("browsers");

interface IUserBrowser {
  user_id: string;
  browser_id: string;
}
const userBrowsersCollection = database.collection("userBrowsers");

// ----------------------------------------------------------
// ----------------------------------------------------------

interface File {
  filename: string;
  new_name: string;
  extension: string;
  size: string;
  content_type: string;
  base64: string;
}

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

  let host: string = request.headers.get("host") || "localhost";
  host = String(host).startsWith("localhost:") ? "localhost" : host;
  const url: URL = new URL(request.url, `https://${host}`);
  let endpoint: string = url.pathname.replace(/\/+$/, "");
  endpoint = endpoint == "" ? "/" : endpoint;
  const method: string = request.method;

  const headers = Object.fromEntries(request.headers);
  const schema = headers["referer"]
    ? String(headers.referer).split("://")[0]
    : null;
  const origin = String(request.headers.get("origin") ?? host)
    .replace("http://", "")
    .replace("https://", "")
    .split("/")[0];

  // CORS Origin skip all...
  if (method === "OPTIONS") {
    return new Response("OK", {
      status: Status.OK,
      headers: {
        ...response_headers,
        "Content-Type": "plain/text",
      },
    });
  }

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

  const browser_id = headers['x-browser-id'];
  //-> global middleware
  if (!browser_id) {
    return new Response("cannot access", {
      status: Status.NotAcceptable,
      headers: {
        ...response_headers,
        "Content-Type": "plain/text",
      },
    });
  }
  const secret_key = `${host}#${browser_id}`;

  const query = Object.fromEntries(url.searchParams);
  let body: any = {};
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      body = JSON.parse(await request.text());
      if (body?._encrypt_) {
        try {
          body = decode(secret_key, body._encrypt_);
          body = JSON.parse(body);
        } catch (_) {
          return new Response("cannot decrypt body", {
            status: Status.BadRequest,
            headers: {
              ...response_headers,
              "Content-Type": "plain/text",
            },
          });
        }
      }
    } catch (_) {
      // skip...
    }
  }
  const files: IObject<File> = {};
  if (
    ["POST", "PUT", "PATCH"].includes(String(request.method).toUpperCase()) &&
    request.headers.get("content-type")?.startsWith("multipart/form-data")
  ) {
    const reqBody = await request.formData();
    for (const [field, val] of reqBody.entries()) {
      if (val instanceof File) {
        const key = String(field).split(" ")[0];

        const filename = val.name;
        const uuid_name = crypto.randomUUID();
        const extension = filename.split(".").pop() as string;
        const new_name = `${uuid_name}.${extension}`;
        const size: any = convertSize(val.size);
        const content_type = val.type;
        const buf = await val.arrayBuffer();
        const base64String = base64.encode(buf);

        files[key] = {
          filename,
          new_name,
          extension,
          size,
          content_type,
          base64: base64String,
        };
      } else {
        body[field] = val;
      }
    }
  }

  const req: any = {
    request_id,
    build,
    version,
    env,

    host,
    url,
    endpoint,
    method,

    headers,
    schema,
    origin,

    query,
    body,
    files,
  };
  let response: any = {};
  // console.log({ req });

  const browser = await browsersCollection.findOne({
    key: browser_id,
  });
  if (!browser) {
    // insert...
    await browsersCollection.insertOne({
      key: browser_id,
      userAgent: headers['user-agent'],
      blocked: false,
    });
  } else {
    // check if blocked
    if (browser.blocked == true) {
      return new Response("you are blocked", {
        status: Status.Locked,
        headers: {
          ...response_headers,
          "Content-Type": "plain/text",
        },
      });
    }
  }
  // console.log({ browser_id, browser });

  try {
    if (endpoint == backend_endpoint.ping) {
      let ip = "";
      try {
        const ipify = await fetch("https://api.ipify.org/?format=json");
        const response_ipify = await ipify.json();
        ip = response_ipify.ip;
      } catch (error) {
        // skip...
      }
      const variable = await variablesCollection.findOne({
        key: "version",
      });
      let version = "";
      if (variable) {
        version = variable.value;
      }
      response = {
        ip,
        version,
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
        response = {
          middlewares,
          routes,
        };
      }
    } else if (String(endpoint).startsWith(backend_endpoint.api)) {
      console.log({ body });
      response = {
        coming_soon: true,
      };
    }

    // endpoint not found...
    if (Object.keys(response).length == 0) {
      statusCode = Status.NotFound;
      response = {
        message: "endpoint not found",
      };
    }

    // ==========================================================================================

    //-> to encryption
    response = {
      _encrypt_: encode(secret_key, JSON.stringify(response)),
    };

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
