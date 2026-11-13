/*
 * Tiny first-party Supabase RPC client.
 * No external JavaScript CDN is required for shared checklists.
 * Data travels only to the configured Supabase project's REST API.
 * Clients check for changes every few seconds while the page is visible.
 */
(function () {
  "use strict";

  const POLL_INTERVAL_MS = 3500;
  const REQUEST_TIMEOUT_MS = 16000;

  window.supabase = {
    createClient: function (projectUrl, publishableKey) {
      const url = String(projectUrl || "").replace(/\/+$/, "");
      const apiKey = String(publishableKey || "");

      return {
        rpc: async function (functionName, parameters) {
          const controller = new AbortController();
          const timeoutId = window.setTimeout(function () {
            controller.abort();
          }, REQUEST_TIMEOUT_MS);
          try {
            const headers = {
              "apikey": apiKey,
              "Content-Type": "application/json",
              "Accept": "application/json"
            };
            // Legacy anon JWTs work with Bearer. New sb_publishable_ keys
            // must be sent as apikey, not as a JWT.
            if (apiKey.startsWith("eyJ")) {
              headers.Authorization = "Bearer " + apiKey;
            }

            const response = await fetch(
              url + "/rest/v1/rpc/" + encodeURIComponent(functionName),
              {
                method: "POST",
                mode: "cors",
                cache: "no-store",
                credentials: "omit",
                headers: headers,
                body: JSON.stringify(parameters || {}),
                signal: controller.signal
              }
            );
            const bodyText = await response.text();
            let data = null;
            if (bodyText) {
              try { data = JSON.parse(bodyText); }
              catch (error) { data = bodyText; }
            }
            if (!response.ok) {
              const message = data && data.message
                ? data.message
                : "云服务返回 HTTP " + response.status;
              return { data: null, error: { message: message, status: response.status } };
            }
            return { data: data, error: null };
          } catch (error) {
            return {
              data: null,
              error: {
                message: error && error.name === "AbortError"
                  ? "连接云端超时，请检查网络或 Supabase 项目状态"
                  : "连接云端失败：" + (error.message || String(error))
              }
            };
          } finally {
            window.clearTimeout(timeoutId);
          }
        },

        channel: function () {
          let refreshHandler = null;
          let timer = null;
          let stopped = false;
          let busy = false;

          const poll = async function () {
            if (stopped || busy || document.visibilityState === "hidden" || !refreshHandler) return;
            busy = true;
            try { await refreshHandler(); }
            catch (error) { console.warn("Cloud refresh check failed", error); }
            finally { busy = false; }
          };
          const onVisibilityChange = function () {
            if (document.visibilityState === "visible") poll();
          };
          const channel = {
            on: function (type, filter, handler) {
              if (type === "broadcast" && filter && filter.event === "refresh") {
                refreshHandler = handler;
              }
              return channel;
            },
            subscribe: function (callback) {
              stopped = false;
              if (timer !== null) window.clearInterval(timer);
              timer = window.setInterval(poll, POLL_INTERVAL_MS);
              document.addEventListener("visibilitychange", onVisibilityChange);
              if (typeof callback === "function") callback("SUBSCRIBED");
              return channel;
            },
            send: function () {
              // Peers discover changes via polling, not public broadcasts.
              return Promise.resolve("ok");
            },
            close: function () {
              stopped = true;
              if (timer !== null) window.clearInterval(timer);
              timer = null;
              document.removeEventListener("visibilitychange", onVisibilityChange);
            }
          };
          return channel;
        },

        removeChannel: async function (channel) {
          if (channel && typeof channel.close === "function") channel.close();
          return "ok";
        }
      };
    }
  };
})();
