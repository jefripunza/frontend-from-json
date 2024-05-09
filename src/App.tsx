import React, { useEffect, useState } from "react";
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
import axios from "axios";

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

const delay = async (timeout_ms: number) =>
  await new Promise((resolve) => setTimeout(resolve, timeout_ms));

const dependencies = {
  window,
  axios,
  toast,
  toastTransition: { Flip, Bounce, Zoom, Slide },
  findAndReplace,
  delay,
};

import PWABadge from "./PWABadge.tsx";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.min.js";
import "react-toastify/dist/ReactToastify.css";
import "./index.css";

import HtmlToJson from "./tools/HtmlToJson.tsx";

interface CustomWindow extends Window {
  store?: any;
}
declare let window: CustomWindow;

interface JSONElement {
  element: string;
  attributes?: { [key: string]: string };
  children?: (JSONElement | string)[];
  action?: {
    [key: string]: string; // action prop can contain multiple actions
  };
}

const execute = async (script: string, args: any): Promise<any> => {
  return await new Function(
    "__req__",
    `let {${Object.keys(args).join(
      ", "
    )}} = __req__; return (async () => {${script}})();`
  )(args);
};

function renderElement(
  _element_: JSONElement,
  navigate: NavigateFunction,
  store: any,
  params: any,
  browser_id: string
): JSX.Element {
  const { element, attributes, children, action } = _element_;
  const elementProps: { [key: string]: string } | undefined = attributes
    ? { ...attributes }
    : undefined;
  const renderedChildren = children?.map((child) => {
    if (typeof child === "string") {
      return child;
    } else {
      return renderElement(child, navigate, store, params, browser_id);
    }
  });
  const eventHandlers: { [key: string]: React.MouseEventHandler } = {};
  if (action) {
    for (const key in action) {
      if (Object.prototype.hasOwnProperty.call(action, key)) {
        eventHandlers[key] = async (e: React.MouseEvent) =>
          await execute(action[key], {
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

const useStore = create(
  zukeeper((set: any) => ({
    setDefault: (data: any) => set(() => data),
    setStore: (data: any) => set((state: any) => ({ ...state, ...data })),
  }))
);
window.store = useStore;

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
        console.log({ error });
      }
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [endpoint, navigate]);

  const [progress, setProgress] = useState(0);
  const [browser_id, setBrowserId] = useState<string>("");

  const [onLoaded, setLoaded] = useState<number>(0); // 0 1 2
  const [notFound, setNotFound] = useState<boolean>(false);

  const [onLoadScript, setOnLoadScript] = useState<string>("");
  const [onCloseScript, setOnCloseScript] = useState<string>("");
  const [params, setParam] = useState<any>({});
  const [render, setRender] = useState<any>({});

  const store = useStore();

  useEffect(() => {
    (async () => {
      const fp = await FingerprintJS.load();
      const fpGet = await fp.get();
      setBrowserId(fpGet.visitorId);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setProgress(10);
      setLoaded(0);
      setNotFound(false);
      let response;
      try {
        response = await fetch("/routes.json");
        setProgress(20);
        const routes = await response.json();
        setProgress(50);
        console.log("/routes.json", { routes, endpoint });

        // Check each route pattern for a match with the current endpoint
        let matchedRoute;
        for (const route of routes.routes) {
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
            const params: { [key: string]: string } = {};
            paramNames.forEach((name, index) => {
              params[name] = decodeURIComponent(match[index + 1]);
            });
            matchedRoute = { ...route, params };
            break;
          }
        }

        if (!matchedRoute) {
          // If no match found, set the route to the not found route
          const notFoundRoute = routes.routes.find(
            (route: any) => route.endpoint === "*"
          );
          if (!notFoundRoute) {
            setNotFound(true);
            return;
          }
          matchedRoute = notFoundRoute;
        }
        setParam(matchedRoute.params);

        // Load data from matched route's JSON file
        response = await fetch(matchedRoute.json);
        setProgress(70);
        const routeData = await response.json();
        setProgress(100);
        console.log(matchedRoute.json, { routeData });
        document.title = routeData.title;
        setRender(routeData.render);
        if (typeof routeData?.onLoad === "string") {
          setOnLoadScript(routeData.onLoad);
        }
        if (typeof routeData?.onClose === "string") {
          setOnCloseScript(routeData.onClose);
        }
        setLoaded(1);
      } catch (error) {
        console.log({ error });
      }
    })();
  }, [endpoint]);

  useEffect(() => {
    const executeScript = async (script: string) => {
      const result = await execute(script, {
        ...dependencies,
        navigate,
        store,
        params,
        browser_id,
      });
      console.log("useEffect", { result });
    };
    if (onLoaded == 1) {
      (async () => {
        await executeScript(onLoadScript);
        setLoaded(2);
      })();
    }
    return () => {
      if (onLoaded == 2) {
        (async () => await executeScript(onCloseScript))();
      }
    };
  }, [onLoaded, store, onLoadScript, onCloseScript, params]);

  if (notFound) {
    return <>Endpoint Not Found...</>;
  }

  if (Object.keys(render).length == 0) {
    return <>Loading...</>;
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
      {renderedElement}
      <PWABadge />
    </>
  );
}

const App = () => {
  return (
    <>
      <RouterProvider
        router={createBrowserRouter([
          {
            path: "/tool/html-to-json",
            element: <HtmlToJson />,
          },
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
