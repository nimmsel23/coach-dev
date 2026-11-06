// Browser geben keine Seriennummer oder genaue iPhone-Generation preis.
// iPadOS kann sich im Desktopmodus als Mac mit mehreren Touchpunkten melden.
export function describeDevice(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  environment = typeof navigator !== 'undefined' ? navigator : {},
) {
  const ua = String(userAgent || '')
  const device = /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) || (/Macintosh|MacIntel/i.test(`${ua} ${environment.platform || ''}`) && environment.maxTouchPoints > 1) ? 'iPad'
      : /iPod/i.test(ua) ? 'iPod'
        : /Android/i.test(ua) ? androidDevice(ua)
          : /Windows/i.test(ua) ? 'Windows'
            : /CrOS/i.test(ua) ? 'Chromebook'
              : /Macintosh|Mac OS X/i.test(ua) ? 'Mac'
                : /Linux/i.test(ua) ? 'Linux' : 'Gerät'
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua) ? 'Edge'
    : /OPR\/|OPiOS\//i.test(ua) ? 'Opera'
      : /SamsungBrowser\//i.test(ua) ? 'Samsung Internet'
        : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
          : /Chrome|CriOS/i.test(ua) ? 'Chrome'
            : /Safari/i.test(ua) ? 'Safari' : 'Browser'
  return `${browser} · ${device}`
}

function androidDevice(ua) {
  // Ältere Android-UAs enthalten ein Modell; reduzierte UAs nur den Platzhalter K.
  const model = ua.match(/Android[^;)]*;\s*(?:[a-z]{2}(?:[-_][a-z]{2})?;\s*)?([^;)]+)/i)?.[1]
    ?.replace(/\s+Build\/.*$/i, '').trim()
  return model && model !== 'K' ? `${model} (Android)` : 'Android'
}
