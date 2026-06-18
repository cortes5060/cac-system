(function () {
  const PING_INTERVAL = 3000;   // cada 3 s
  const PING_TIMEOUT  = 4000;   // timeout por intento
  const DOWN_LIMIT    = 10000;  // redirige tras 10 s caído

  let failingSince = null;
  let intervalId   = null;

  async function ping() {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT);
    try {
      const res = await fetch(`${API}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) { failingSince = null; return; }
    } catch (_) {
      clearTimeout(timer);
    }
    if (!failingSince) failingSince = Date.now();
    if (Date.now() - failingSince >= DOWN_LIMIT) {
      clearInterval(intervalId);
      window.location.href = 'loading.html';
    }
  }

  intervalId = setInterval(ping, PING_INTERVAL);
})();
