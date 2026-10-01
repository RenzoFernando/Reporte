# Reporte quincenal de tiempo laborado

Aplicación estática, sin backend, pensada para publicarse gratis en GitHub Pages.

## Qué hace
- Guarda los datos fijos del trabajador en el navegador; no quedan escritos en el código público del sitio.
- Permite elegir año, mes y 1.ª/2.ª quincena.
- Registra jornadas con ingreso, salida, almuerzo, proyecto y transporte.
- Calcula automáticamente permanencia y horas laboradas.
- Agrupa por semanas de lunes a domingo.
- Genera un Excel `.xlsx` y un PDF `.pdf`.
- Mantiene en blanco la firma del supervisor.
- Escribe la firma del trabajador con su nombre en estilo cursivo.
- Calcula el transporte registrado y el porcentaje a cargo del empleador.
- Permite indicar de forma independiente los días de auxilio diario pactado.
- Guarda todo en `localStorage`; no requiere base de datos.

## Probar localmente
Abre `index.html` en un navegador moderno con conexión a internet. Las librerías para generar Excel y PDF se cargan desde jsDelivr.

## Publicar en GitHub Pages
1. Crea un repositorio, por ejemplo `reporte-quincenal`.
2. Sube `index.html`, `styles.css` y `app.js` a la raíz.
3. En GitHub: **Settings → Pages**.
4. En **Build and deployment**, elige **Deploy from a branch**.
5. Selecciona `main` y `/ (root)`.
6. Guarda. GitHub mostrará la URL pública.

## Flujo recomendado
En vez de que el trabajador mande una foto y otra persona transcriba todo, el trabajador abre la página desde el celular al terminar cada jornada y registra el turno. Al final de la quincena solo se revisa y se descargan Excel y PDF.

## Limitación actual
Esta versión no interpreta automáticamente una foto de la libreta. Si se quiere conservar el flujo "mandar foto", la siguiente versión debería integrar OCR/visión con un servicio externo o con una automatización que procese la foto y llene los registros.
