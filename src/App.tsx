import React, { useCallback, useEffect, useState } from "react";
// import { unregisterSW } from "virtual:pwa-register";

import {
  createBrowserRouter,
  RouterProvider,
  useNavigate,
  NavigateFunction,
} from "react-router-dom";
import LoadingBar from "react-top-loading-bar";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import {
  ToastContainer,
  toast,
  Flip,
  Bounce,
  Zoom,
  Slide,
} from "react-toastify";
import { create } from "zustand";
import zukeeper from "zukeeper";
import anime from "animejs/lib/anime.es.js";
import _axios_, { AxiosRequestConfig, AxiosError } from "axios";
import CryptoJS from "crypto-js";
import { v4 as uuidv4 } from "uuid";

interface IObject<T> {
  [key: string]: T;
}

const env = import.meta.env;

function getSecretKey(browser_id: string) {
  const origin = window.location.host;
  const secret_key = `${origin}#${browser_id}`;
  // console.log({ secret_key, origin: window.location }); // debug...
  return secret_key;
}
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

function EncodeEndToEnd(browser_id: string, text: string) {
  const secret_key = getSecretKey(browser_id);
  return encode(secret_key, text);
}
function DecodeEndToEnd(browser_id: string, encoded_text: string) {
  const secret_key = getSecretKey(browser_id);
  return decode(secret_key, encoded_text);
}

const axios = _axios_.create();
axios.defaults.baseURL = env.PROD ? "" : "http://localhost:1234";
const errorHandling = (error: AxiosError) => {
  return Promise.reject(
    (error.response && error.response.data) || "Something went wrong!"
  );
};
const axiosLogDebug = (
  is_production: boolean,
  on: string,
  info: AxiosRequestConfig,
  status: string,
  data: any
) => {
  const urlParams = new URLSearchParams(window.location.search);
  const debug =
    urlParams.get("debug") == "1" || localStorage.getItem("_DEBUG_") == "1";
  if (!is_production && debug) {
    info = info?.method ? info : info.url ? info : info;
    const method = String(info.method).toUpperCase();
    const url = (info?.baseURL || "") + (info?.url || "");
    console.log(`(${on}) ${method} ${url} "${status}"`, { data });
    localStorage.setItem("_DEBUG_", "1");
  }
};
axios.interceptors.request.use(
  async (request) => {
    const is_production = env.PROD;
    if (typeof request.params != "object") {
      request.params = {};
    }
    if (
      typeof request.params?.encrypt == "undefined" ||
      !(
        typeof request.params?.encrypt == "string" &&
        (request.params.encrypt == "1" || request.params.encrypt == 1)
      )
    ) {
      request.params["encrypt"] = 1;
    }
    if (!request.headers["Content-Type"]) {
      request.headers["Accept"] = "application/json";
      request.headers["Content-Type"] = "application/json";
    }
    if (!request.headers.Authorization) {
      const token = localStorage.getItem("token");
      if (token) {
        request.headers.Authorization = `Bearer ${token}`;
      }
    }
    const browser_id = await getBrowserId();
    request.headers["x-browser-id"] = browser_id;
    // Encrypting request body
    if (request.data && typeof request.data === "object") {
      const data = request.data;
      axiosLogDebug(is_production, "request", request, "prepare", data);
      const _encrypt_ = await EncodeEndToEnd(browser_id, JSON.stringify(data));
      request.data = { _encrypt_ };
    } else {
      axiosLogDebug(is_production, "request", request, "prepare", {});
    }
    return request;
  },
  (error) => errorHandling(error)
);
interface NewResponse<T> {
  success: boolean;
  data?: T;
  headers: any;
  status: number | null;
  message: string | null;
}
axios.interceptors.response.use(
  // from server response
  async (response): Promise<any> => {
    const is_production = env.PROD;
    if (response.data?._encrypt_) {
      try {
        // Decrypting response data
        const browser_id = await getBrowserId();
        const decrypt = DecodeEndToEnd(browser_id, response.data._encrypt_);
        const data = JSON.parse(decrypt);
        axiosLogDebug(is_production, "response", response, "success", data);
        return {
          success: true,
          data,
          headers: response?.headers || {},
          status: response?.status || null,
          message: "OK",
        };
      } catch (error) {
        axiosLogDebug(is_production, "response", response, "error decrypt", {});
        return {
          success: false,
          data: null,
          headers: response?.headers || {},
          status: response?.status || null,
          message: "Error decrypting response",
        };
      }
    } else {
      axiosLogDebug(
        is_production,
        "response",
        response,
        "success",
        response?.data || {}
      );
    }
    return {
      success: true,
      data: response?.data,
      headers: response?.headers || {},
      status: response?.status || null,
      message: "OK",
    };
  },
  async (error): Promise<NewResponse<any>> => {
    const message = error?.message;
    const response = error.response;
    const data = error?.response?.data;
    if (data) {
      if (data?._encrypt_) {
        const _encrypt_ = data._encrypt_;
        try {
          // Decrypting response data
          const browser_id = await getBrowserId();
          const decrypt = DecodeEndToEnd(browser_id, _encrypt_);
          const data = JSON.parse(decrypt);
          axiosLogDebug(
            !String(window.location.host).includes("localhost"),
            "response",
            error,
            "error",
            data
          );
          return {
            success: false,
            data,
            headers: response?.headers || {},
            status: response?.status || null,
            message: message || response?.statusText || null,
          };
        } catch (error) {
          console.error("data on error in try catch:", { error });
          return {
            success: false,
            data: null,
            headers: response?.headers || {},
            status: response?.status || null,
            message: "Error decrypting response",
          };
        }
      } else {
        axiosLogDebug(
          !String(window.location.host).includes("localhost"),
          "response",
          error,
          "error",
          data
        );
      }
    } else {
      axiosLogDebug(
        !String(window.location.host).includes("localhost"),
        "response",
        error,
        "error",
        {}
      );
    }
    return {
      success: false,
      data,
      headers: response?.headers || {},
      status: response?.status || null,
      message: message || response?.statusText || null,
    };
  }
);

const findAndReplace = (key: string, value: string) => {
  const elements = document.getElementsByTagName("*");
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (element.childNodes.length > 0) {
      for (let j = 0; j < element.childNodes.length; j++) {
        const node = element.childNodes[j];
        if (node.nodeType === 3) {
          let text = node.nodeValue;
          if (text && text.includes(key)) {
            text = text.replace(new RegExp(key, "g"), value);
            node.nodeValue = text;
          }
        }
      }
    }
  }
};

const delay = async (timeout_ms: number) => {
  return await new Promise((resolve) => setTimeout(resolve, timeout_ms));
};

interface Coordinates {
  longitude: number;
  latitude: number;
}
const getAddress = async ({
  longitude,
  latitude,
}: Coordinates): Promise<any> => {
  try {
    const res = await _axios_.get(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
    );
    return res.data;
  } catch (error) {
    console.error("Error fetching address:", error);
    return null;
  }
};

function isArray(value: any): boolean {
  return value && typeof value === "object" && Array.isArray(value);
}
function isObject(value: any): boolean {
  return value && typeof value === "object" && !Array.isArray(value);
}
function isInt(n: any): boolean {
  return Number(n) === n && n % 1 === 0;
}
function isFloat(n: any): boolean {
  return Number(n) === n && n % 1 !== 0;
}

const formatRupiah = (angka: number, prefix?: string): string => {
  const value = parseFloat(angka.toString());
  const valueString = value.toFixed(2);
  const number_string = String(parseInt(angka.toString())).replace(
    /[^,\d]/g,
    ""
  );
  const split = number_string.split(",");
  const sisa = split[0].length % 3;
  let rupiah = split[0].substr(0, sisa);
  const ribuan = split[0].substr(sisa).match(/\d{3}/gi);
  if (ribuan) {
    const separator = sisa ? "." : "";
    rupiah += separator + ribuan.join(".");
  }
  rupiah = split[1] !== undefined ? rupiah + "," + split[1] : rupiah;
  if (valueString.includes(".")) {
    const [, decimal] = valueString.split(".");
    rupiah += `,${decimal.padEnd(2, "0")}`;
  } else {
    rupiah += ",00";
  }
  return prefix === undefined ? rupiah : rupiah ? prefix + rupiah : "";
};

const dependencies = {
  window,
  _axios_,
  axios,
  toast,
  toastTransition: { Flip, Bounce, Zoom, Slide },
  anime,
  encode,
  decode,
  findAndReplace,
  delay,
  getAddress,
  isArray,
  isObject,
  isInt,
  isFloat,
  formatRupiah,
};

import PWABadge from "./PWABadge.tsx";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.min.js";
import "react-toastify/dist/ReactToastify.css";
import "./index.css";

import HtmlToJson from "./tools/HtmlToJson.tsx";

const tools = [
  {
    path: "/tool/html-to-json",
    element: <HtmlToJson />,
  },
];

interface CustomWindow extends Window {
  store?: any;
}
declare let window: CustomWindow;

const getBrowserId = async () => {
  const fp = await FingerprintJS.load();
  const fpGet = await fp.get();
  return fpGet.visitorId;
};

const execute = async (script: string, args: any): Promise<any> => {
  return await new Function(
    "__req__",
    `let {${Object.keys(args).join(
      ", "
    )}} = __req__; return (async () => {${script}})();`
  )(args);
};

interface JSONElement {
  element: string;
  attributes?: IObject<string>;
  children?: (JSONElement | string)[];
}
function renderElement(
  _element_: JSONElement,
  navigate: NavigateFunction,
  store: any,
  params: any,
  browser_id: string
): JSX.Element {
  const { element, attributes, children } = _element_;
  const elementProps: IObject<string> | undefined = attributes
    ? { ...attributes }
    : undefined;
  const renderedChildren = children?.map((child) => {
    if (typeof child === "string") {
      return child;
    } else {
      return renderElement(child, navigate, store, params, browser_id);
    }
  });
  const eventHandlers: IObject<React.MouseEventHandler> = {};
  if (elementProps) {
    for (const key in elementProps) {
      if (
        Object.prototype.hasOwnProperty.call(elementProps, key) &&
        [
          "onCopy",
          "onCut",
          "onPaste",

          "onChange",
          "onBeforeInput",
          "onSubmit",
          "onLoad",
          "onError",

          "onClick",
          "onKeyDown",
          "onKeyPress",
          "onKeyUp",

          "onScroll",

          "onFocus",
          "onBlur",
          "onMouseOver",
        ].includes(key)
      ) {
        eventHandlers[key] = async (e: React.MouseEvent) =>
          await execute(elementProps[key], {
            ...dependencies,
            navigate,
            store,
            params,
            browser_id,
            e,
          });
      }
    }
  }
  return React.createElement(
    element,
    { ...elementProps, ...eventHandlers },
    ...(renderedChildren || [])
  );
}

interface IStore {
  setDefault: (data: any) => void;
  setStore: (data: any) => void;
}
const useStore = create<IStore>(
  zukeeper((set: any) => ({
    setDefault: (data: any) => set(() => data),
    setStore: (data: any) => set((state: any) => ({ ...state, ...data })),
  }))
);
window.store = useStore;

interface IDatabase {
  [dbName: string]: IDBDatabase;
}

interface ITable {
  name: string;
  keyPath: string;
  autoIncrement?: boolean;
}

class Database<T> {
  private dbVersion: number = 1;
  private databases: IDatabase = {};

  constructor(dbVersion?: number) {
    this.dbVersion = dbVersion || 1;
  }

  connect(dbName: string, tables?: ITable[] | undefined): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (this.databases[dbName]) {
        resolve(this.databases[dbName]);
        return;
      }
      const request = indexedDB.open(dbName, this.dbVersion);
      request.onerror = () => {
        reject(request.error);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = function () {
          db.close();
          alert("Database is outdated, please reload the page.");
          window.location.reload();
        };
        this.databases[dbName] = db;
        console.log(`✅ Database (${dbName}) connected!`);
        resolve(db);
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as any).result;
        db.onversionchange = function () {
          db.close();
          alert("Database is outdated, please reload the page.");
          window.location.reload();
        };
        if (tables) {
          for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            const name = table.name;
            const keyPath = table.keyPath;
            const autoIncrement = table.autoIncrement;
            db.createObjectStore(name, { keyPath, autoIncrement });
          }
        }
        resolve(db);
      };
    });
  }

  listDatabases(): string[] {
    return Object.keys(this.databases);
  }

  add(dbName: string, tableName: string, data: T): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.add(dbName, tableName, data));
      }
      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readwrite"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.add(data);
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  getAll<T>(dbName: string, tableName: string): Promise<T[]> {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.getAll(dbName, tableName));
      }
      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readonly"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.getAll();
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  get(
    dbName: string,
    tableName: string,
    key: IDBValidKey | IDBKeyRange
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.get(dbName, tableName, key));
      }

      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readonly"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.get(key);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  update(
    dbName: string,
    tableName: string,
    key: IDBValidKey,
    newData: T
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.update(dbName, tableName, key, newData));
      }

      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readwrite"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.put(newData, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  delete(
    dbName: string,
    tableName: string,
    key: IDBValidKey | IDBKeyRange
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.delete(dbName, tableName, key));
      }

      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readwrite"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  clear(dbName: string, tableName: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.clear(dbName, tableName));
      }

      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readwrite"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

const db = new Database(1);

const variables = {
  get: async (key: string) => {
    const result: any = await db.get("app", "variables", key);
    if (!result) return null;
    return result.value;
  },
  set: async (key: string, value: any) => {
    try {
      const result: any = await db.get("app", "variables", key);
      if (result) {
        await db.delete("app", "variables", key);
        await db.add("app", "variables", { key, value });
      } else {
        await db.add("app", "variables", { key, value });
      }
    } catch (error) {
      // skip...
    }
  },
};

interface IRender {
  element: string;
  children: IRender[];
  attributes?: IObject<string | number>;
}
interface IView {
  title: string;
  style?: string;
  onLoad?: string;
  onClose?: string;
  render: IRender;
}
interface IRoute {
  endpoint: string;
  middlewares: string[];
  view: IView | string; // string jika encrypted
}
interface IMatchRoute extends IRoute {
  params: IObject<string>;
}

interface IMiddleware {
  key: string;
  script: string;
  order: number;
}

function Main(): JSX.Element {
  const navigate = useNavigate();
  const endpoint = window.location.pathname;

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName != "A") {
        return; // skip...
      }
      event.preventDefault();
      const anchor = target.closest("a");
      if (!anchor) return;
      const hash = (anchor as HTMLAnchorElement).hash;
      const href = anchor.getAttribute("href");
      const navigate_replace = anchor.getAttribute("data-navigate-replace");
      const targetAttr = anchor.getAttribute("target");
      try {
        if (hash && String(hash).startsWith("#")) {
          const id = String(hash).replace(/#/g, "");
          const targetElement = document.getElementById(id);
          if (targetElement) {
            targetElement.scrollIntoView({
              behavior: "smooth",
            });
          } else {
            if (id === "top") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }
        } else if (targetAttr === "_blank" && href) {
          window.open(href, "_blank")?.focus();
        } else {
          if (href) {
            if (navigate_replace) {
              navigate(href, { replace: true });
            } else {
              navigate(href);
            }
          }
        }
      } catch (error) {
        console.error({ error });
      }
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [endpoint, navigate]);

  const [updateServiceWorker, setUpdateServiceWorker] = useState<string>("");

  const [progress, setProgress] = useState<number>(0);
  const [browser_id, setBrowserId] = useState<string>("");

  const [onLoaded, setLoaded] = useState<number>(0); // 0 1 2
  const [notFound, setNotFound] = useState<boolean>(false);

  const [onLoadScript, setOnLoadScript] = useState<string>("");
  const [onCloseScript, setOnCloseScript] = useState<string>("");
  const [params, setParam] = useState<any>({});

  const [style, setStyle] = useState<string>("");
  const [render, setRender] = useState<any>({});
  const [listRoutes, setListRoute] = useState<IRoute[]>([]);

  const store = useStore();

  //-> check online or offline
  const [isOnline, setOnline] = useState(true);
  const [onLoad, setLoad] = useState<boolean>(false);
  useEffect(() => {
    const retry = async () => {
      try {
        const ping: any = await axios.get("/ping");
        if (ping.success) {
          const ip = ping.data.ip;
          await variables.set("ip", ip);
          const version = ping.data.version;
          const existing_version = await variables.get("version");
          if (version != existing_version) {
            const init: NewResponse<any> = await axios.get("/init");

            const routes: IRoute[] = init?.data?.routes || [];
            await db.clear("app", "routes");
            for (let i = 0; i < routes.length; i++) {
              const route = routes[i];
              try {
                await db.add("app", "routes", { ...route });
              } catch (error) {
                // skip...
              }
            }

            const middlewares: IMiddleware[] = init?.data?.middlewares || [];
            await db.clear("app", "middlewares");
            for (let i = 0; i < middlewares.length; i++) {
              const middleware = middlewares[i];
              try {
                await db.add("app", "middlewares", { ...middleware });
              } catch (error) {
                // skip...
              }
            }

            await variables.set("version", version); // paling terakhir / tanda tangan kontrak setuju
            setUpdateServiceWorker(uuidv4()); // update pwa...
            window.location.reload();
          }

          setOnline(true);

          // console.log({ ip, version }); // debug...
        } else {
          setOnline(false);
        }
      } catch (error) {
        setOnline(false);
      } finally {
        await delay(3000);
        retry();
      }
    };
    retry();
  }, []);
  useEffect(() => {
    if (isOnline) {
      if (onLoad) {
        toast.success("now is online!");
      }
    } else {
      if (onLoad) {
        toast.error("you are offline!");
      }
      setLoad(true);
    }
  }, [isOnline, onLoad]);

  useEffect(() => {
    (async () => setBrowserId(await getBrowserId()))();
  }, []);

  //-> handling page and main management
  useEffect(() => {
    (async () => {
      setProgress(10);
      setLoaded(0);
      setNotFound(false);
      document.title = "Please wait...";
      try {
        await db.connect("app", [
          {
            name: "variables",
            keyPath: "key",
            autoIncrement: true,
          },
          {
            name: "pendingApis",
            keyPath: "key",
            autoIncrement: true,
          },

          {
            name: "routes",
            keyPath: "endpoint",
          },
          {
            name: "middlewares",
            keyPath: "key",
          },
        ]);

        const routes = await db.getAll<IRoute>("app", "routes");
        setListRoute(routes);
        setProgress(30);

        // Check each route pattern for a match with the current endpoint
        let matchedRoute: IMatchRoute | undefined;
        for (const route of routes) {
          if (route.endpoint == "*") continue;
          let modifiedEndpoint = route.endpoint.startsWith("/")
            ? route.endpoint
            : "/" + route.endpoint;
          if (modifiedEndpoint != "/" && modifiedEndpoint.endsWith("/")) {
            modifiedEndpoint = modifiedEndpoint.slice(0, -1);
          }
          const paramNames: string[] = [];
          const modifiedEndpointRegex = new RegExp(
            "^" +
              modifiedEndpoint.replace(
                /:([^/]+)/g,
                (_: any, paramName: string) => {
                  paramNames.push(paramName);
                  return "([^/]+)";
                }
              ) +
              "$"
          );
          const match = endpoint.match(modifiedEndpointRegex);
          if (match) {
            const params: IObject<string> = {};
            paramNames.forEach((name, index) => {
              params[name] = decodeURIComponent(match[index + 1]);
            });
            matchedRoute = {
              endpoint: "",
              middlewares: [],
              view: route.view as IView,
              params,
            };
            break;
          }
        }

        if (!matchedRoute) {
          // If no match found, set the route to the not found route
          const notFoundRoute = routes.find(
            (route: any) => route.endpoint === "*"
          );
          if (!notFoundRoute) {
            setNotFound(true);
            return;
          }
          matchedRoute = { ...notFoundRoute, params: {} };
        }
        const match_middlewares = matchedRoute.middlewares;

        const middlewares: IMiddleware[] = await db.getAll(
          "app",
          "middlewares"
        );
        const middleware_uses = middlewares.filter((middleware) =>
          match_middlewares.includes(middleware.key)
        );
        for (let i = 0; i < middleware_uses.length; i++) {
          const middleware = middleware_uses[i];
          console.log({ use_middleware: middleware });
        }
        setProgress(50);

        const params = matchedRoute?.params || {};
        const view = matchedRoute?.view as IView;
        const title = view?.title || "";
        const onLoad = view?.onLoad || "";
        const onClose = view?.onClose || "";
        const style = view?.style || "";
        const render = view?.render || {};
        // render = moveAttributesToAction(render);

        document.title = title;
        setParam(params);
        setStyle(style);
        setRender(render);
        if (typeof onLoad === "string") {
          setOnLoadScript(onLoad);
        }
        if (typeof onClose === "string") {
          setOnCloseScript(onClose);
        }

        setLoaded(1);
        setProgress(100);
      } catch (error) {
        console.error({ error });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  //-> execute script onload and onclose from json
  const executeScript = useCallback(
    async (script: string) => {
      const result = await execute(script, {
        ...dependencies,
        navigate,
        store,
        params,
        browser_id,
      });
      console.log("useEffect", { return: result });
    },
    [navigate, store, params, browser_id]
  );
  useEffect(() => {
    if (onLoaded == 1 && browser_id) {
      (async () => {
        await executeScript(onLoadScript);
        setLoaded(2);
      })();
    }
  }, [browser_id, executeScript, onLoadScript, onLoaded]);
  const [previousEndpoint, setPreviousEndpoint] = useState<string>(
    window.location.pathname
  );
  useEffect(() => {
    const endpoint = window.location.pathname;
    return () => {
      console.log({
        endpoint,
        previousEndpoint,
      });
      if (onLoaded == 2 && endpoint !== previousEndpoint) {
        (async () => {
          await executeScript(onCloseScript);
          setPreviousEndpoint(endpoint);
        })();
      }
    };
  }, [executeScript, onCloseScript, onLoaded, previousEndpoint, store]);

  if (notFound && listRoutes.length > 0) {
    return <EndpointNotFoundPage endpoint={endpoint} />;
  }
  if (Object.keys(render).length == 0) {
    return <InitializePage />;
  }

  // Render the JSON data
  const renderedElement = renderElement(
    render,
    navigate,
    store,
    params,
    browser_id
  );
  return (
    <>
      <LoadingBar
        color="#28a745"
        progress={progress}
        onLoaderFinished={() => setProgress(0)}
      />
      <style>{style}</style>
      {renderedElement}
      <PWABadge update={updateServiceWorker} />
    </>
  );
}

const EndpointNotFoundPage = ({ endpoint }: { endpoint: string }) => {
  return <div>Endpoint Not Found... {endpoint}</div>;
};
const InitializePage = () => {
  return <div>Loading...</div>;
};

const App = () => {
  return (
    <>
      <RouterProvider
        router={createBrowserRouter([
          ...tools,
          {
            path: "*",
            element: <Main />,
          },
        ])}
      />
      <ToastContainer />
    </>
  );
};

export default App;
