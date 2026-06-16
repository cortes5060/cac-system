(function () {
  function showBanner() {
    document.getElementById('banner-desconexion')?.classList.add('visible');
  }
  function hideBanner() {
    document.getElementById('banner-desconexion')?.classList.remove('visible');
  }

  // Espera a que socket esté definido y engancha los eventos
  document.addEventListener('DOMContentLoaded', () => {
    let intentos = 0;
    const check = setInterval(() => {
      if (typeof socket !== 'undefined') {
        clearInterval(check);
        socket.on('disconnect', showBanner);
        socket.on('connect',    hideBanner);
        socket.on('reconnect',  hideBanner);
        if (!socket.connected) showBanner();
      }
      if (++intentos > 50) clearInterval(check);
    }, 200);
  });

  // Intercepta todos los fetch para detectar errores de red
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const res = await _fetch(...args);
      if (res.ok) hideBanner();
      return res;
    } catch (err) {
      showBanner();
      throw err;
    }
  };
})();
