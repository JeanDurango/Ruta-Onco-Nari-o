# Ruta Oncológica — Demo público

Copia estática de `ruta-oncologica-widget/app` pensada para alojarse en
GitHub Pages (o cualquier hosting estático) y mostrar la plataforma sin
necesidad del Client Portal de Zoho.

Cuando esta página corre fuera de un iframe real de Zoho, `app.js` entra
solo a un selector de 4 roles de demo y genera datos ficticios en memoria
(persistidos en `sessionStorage` del navegador de quien la abre) — no se
conecta a Zoho ni a Catalyst para nada.

**Esta carpeta es una copia para desplegar, no la fuente de verdad.** El
código real del widget (el que sí va a Zoho) vive en
`../ruta-oncologica-widget/app`. Si editas `app.js`/`styles.css` ahí, vuelve
a copiar los archivos aquí (o pide que se resincronicen) antes de volver a
publicar este demo.
