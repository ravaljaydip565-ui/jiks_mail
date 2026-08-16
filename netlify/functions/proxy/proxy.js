// Netlify serverless proxy for mail.tm and temp.tf
// Solves the CORS + rate-limit + timeout problem entirely.
const ALLOWED = {
  mailtm: "https://api.mail.tm",
  temptf: "https://temp.tf",
};

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    const q = event.queryStringParameters || {};
    let target = q.target;

    // path form: /api/proxy/mailtm/domains  or  /api/proxy/temptf/api/account
    if (!target) {
      const seg = (event.path || "").replace(/^\/api\/proxy\/?/, "").split("/");
      const up = seg.shift();
      if (up === "mailtm") target = ALLOWED.mailtm + "/" + seg.join("/");
      else if (up === "temptf") target = ALLOWED.temptf + "/" + seg.join("/");
    }

    if (!target) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "missing target" }) };
    }

    let urlObj;
    try { urlObj = new URL(target); } catch (e) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "bad url" }) };
    }

    const hostAllowed = Object.values(ALLOWED).some((base) => urlObj.origin === new URL(base).origin);
    if (!hostAllowed) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "host not allowed" }) };
    }

    const method = event.httpMethod;
    const upstreamHeaders = { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "JiksMail/3.0" };
    const auth = event.headers["authorization"] || event.headers["Authorization"];
    if (auth) upstreamHeaders["Authorization"] = auth;

    const fetchOpts = { method, headers: upstreamHeaders };
    if (event.body && method !== "GET" && method !== "HEAD") {
      fetchOpts.body = event.body;
    }

    const resp = await fetch(urlObj.toString(), fetchOpts);
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text || "{}"); } catch (e) { data = { raw: text }; }

    return { statusCode: 200, headers, body: JSON.stringify({ status: resp.status, data }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: e.message || "proxy error" }) };
  }
};
      
