/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("message", (ev) => {
    if (!ev.data) {
      return;
    } else if (ev.data.type === "deregister") {
      self.registration
        .unregister()
        .then(() => {
          return self.clients.matchAll();
        })
        .then(clients => {
          clients.forEach(client => client.navigate(client.url));
        });
    }
  });

  self.addEventListener("fetch", function (event) {
    const r = event.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
      return;
    }

    const request = (coepCredentialless && r.mode === "no-cors")
      ? new Request(r, {
        credentials: "omit",
      })
      : r;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
          newHeaders.set(
            "Cross-Origin-Embedder-Policy",
            coepCredentialless ? "credentialless" : "require-corp"
          );

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
    window.sessionStorage.removeItem("coiReloadedBySelf");
    const coepDegrading = (reloadedBySelf === "coepdegrade");

    if (window.crossOriginIsolated || coepDegrading) {
      return;
    }

    if ("serviceWorker" in navigator) {
      const currentScript = document.currentScript;
      const scriptUrl = currentScript ? currentScript.src : "coi-serviceworker.js";

      navigator.serviceWorker
        .register(scriptUrl)
        .then(
          (registration) => {
            registration.addEventListener("updatefound", () => {
              window.location.reload();
            });

            if (registration.active && !navigator.serviceWorker.controller) {
              window.sessionStorage.setItem("coiReloadedBySelf", "true");
              window.location.reload();
            }
          },
          (err) => {
            console.error("COI ServiceWorker registration failed: ", err);
          }
        );
    }
  })();
}
