# Local iTab

[简体中文](README.md) · [English](README.en.md) · [Español](README.es-ES.md)

Una página de nueva pestaña para Chrome centrada en tus datos locales. Reúne las búsquedas, tus sitios guardados y un pequeño panel personal para tener a mano lo que usas cada día.

**Uso sin conexión · Accesos directos por categorías · Diseño personalizable · Sincronización y copias opcionales**

No requiere compilación ni una cuenta de Local iTab. El reloj, la gestión de accesos directos, las imágenes locales y las tarjetas que completas manualmente funcionan sin conexión. Las búsquedas, las visitas a sitios web y las funciones opcionales en la nube necesitan acceso a Internet.

## Vista previa

Capturas de la extensión real en inglés con la misma configuración de ejemplo y categorías en chino. La selección de sitios, los iconos y las tarjetas son ilustrativos; el tiempo, los temas y la película se introducen manualmente y no son datos en tiempo real.

**A / Clarity · Claro · Cuadrícula**

![Plantilla Clarity clara de Local iTab con accesos por categorías, búsqueda y reloj](docs/screenshots/clarity-light-grid.png)

**B / Graphite · Oscuro · Grupos por categoría**

![Plantilla Graphite oscura de Local iTab con accesos agrupados por categoría](docs/screenshots/graphite-dark-grid.png)

**C / Folio · Claro · Grupos por categoría**

![Plantilla Folio clara de Local iTab con los primeros dos grupos y tarjetas de tiempo y temas de ejemplo](docs/screenshots/folio-light-grid.png)

<details>
<summary>Más variantes claras y oscuras y disposición libre (4 capturas)</summary>

**A / Clarity · Oscuro · Cuadrícula**

![Plantilla Clarity oscura de Local iTab con la misma configuración de ejemplo](docs/screenshots/clarity-dark-grid.png)

**B / Graphite · Claro · Grupos por categoría**

![Plantilla Graphite clara de Local iTab con accesos agrupados por categoría](docs/screenshots/graphite-light-grid.png)

**C / Folio · Oscuro · Grupos por categoría**

![Plantilla Folio oscura de Local iTab con los primeros dos grupos y tarjetas de tiempo y temas de ejemplo](docs/screenshots/folio-dark-grid.png)

**A / Clarity · Claro · Disposición libre sin ajuste a la cuadrícula**

![Disposición libre de Clarity clara tras arrastrar GitHub, con el estado guardado visible](docs/screenshots/free-layout.png)

</details>

## Funciones

- **Buscar y navegar**: Usa Google, Bing, DuckDuckGo o una URL de búsqueda personalizada, o abre un sitio directamente. En una plantilla personalizada, `%s` representa el término de búsqueda; por ejemplo, `https://example.com/search?q=%s`.
- **Accesos directos organizados**: Añade, edita y elimina sitios; filtra por categoría; elige Cuadrícula (predeterminada, con reordenación al arrastrar), colocación libre (sin ajuste) o colocación manual con ajuste a la cuadrícula desde la página principal o Configuración. Cambiar de modo conserva las posiciones guardadas. El menú contextual incluye acciones para cada acceso y una opción para abrir todos los sitios de una categoría.
- **Quince plantillas de trabajo**: Se conservan A / Clarity, B / Graphite y C / Folio y se añaden doce diseños, todos con colores claros y oscuros. Una instalación nueva sigue usando A/claro. Cambiar de estilo solo guarda la apariencia: conserva sitios, categorías, tareas, fondos, colocación y coordenadas. Los estilos agrupados usan categorías reales; la disposición libre conserva su plano de coordenadas. [Guía de estilos (en inglés)](docs/template-gallery.en.md).
- **Diseño a tu gusto**: Usa el fondo de la plantilla, un color sólido o una imagen local. Ajusta las columnas, el espaciado, los iconos y los títulos, y muestra u oculta cada módulo.
- **Tarjetas locales sencillas**: Reloj, tiempo, temas de interés, película y una frase personal. Las tarjetas de tiempo, temas y películas se rellenan manualmente y están ocultas de forma predeterminada; no obtienen datos en tiempo real.
- **Copias locales en JSON**: Exporta la configuración y las imágenes locales, o importa una copia existente. La importación valida los datos y pide confirmación. Restaurar sustituye la configuración actual, así que conviene exportar una copia antes. Los archivos de más de 10 MiB muestran un aviso sobre el uso de memoria antes de leerlos y se pueden cancelar. La restauración de archivos grandes sigue dependiendo de la memoria disponible en el navegador. Se conserva el estado de sincronización del dispositivo actual.
- **Funciones opcionales en la nube**: Chrome Sync sincroniza ajustes ligeros; Google Drive guarda instantáneas manuales agrupadas por nombre del equipo. Su funcionamiento y sus límites se explican a continuación.

## Instalación y primeros pasos

1. Descarga y descomprime el código fuente del repositorio, o clona este repositorio. El código se puede cargar directamente, sin compilar.
2. Abre `chrome://extensions/` en Chrome y activa el **Modo de desarrollador**.
3. Haz clic en **Cargar descomprimida** y selecciona **la carpeta que contiene directamente `manifest.json`**, normalmente `chrome-local-itab/` o la carpeta del repositorio extraído. No selecciones el ZIP ni la carpeta superior.
4. Abre una nueva pestaña, añade tus sitios favoritos y entra en Configuración para ajustar el aspecto, la búsqueda y los módulos.

Después de actualizar el código, pulsa **Recargar** en la página de extensiones y actualiza las páginas de nueva pestaña y Configuración que tengas abiertas. Exporta una copia antes de desinstalar la extensión o borrar sus datos.

Usa Chrome con soporte para Manifest V3. La protección frente a escrituras simultáneas de accesos directos y de su colocación también utiliza `navigator.locks`; si la API necesaria no está disponible, estas escrituras fallan y se muestra un error.

## Datos, privacidad y conexiones de red

La configuración, los accesos directos y las imágenes cargadas se guardan principalmente en `chrome.storage.local`. Los iconos de sitios usan una caché local en IndexedDB, y parte del estado de la interfaz se guarda en el almacenamiento local del navegador. La extensión no incluye scripts de analítica ni publicidad.

- **Búsqueda**: Escribir no envía el texto de búsqueda. Al enviar una búsqueda o abrir una URL, se visita el proveedor elegido o el sitio de destino.
- **Iconos de sitios**: Su descarga en línea está desactivada de forma predeterminada. Para activarla también debes conceder el permiso opcional `https://www.google.com/*` en el dispositivo actual. La extensión envía entonces los nombres de dominio al servicio de favicons de Google para obtener sus iconos. Los iconos válidos de la caché se pueden reutilizar sin conexión; la caché caduca actualmente a los siete días.
- **Tarjetas y fondos locales**: El contenido de tiempo, temas y películas, así como los fondos cargados, no depende de fuentes remotas.
- **Chrome Sync**: La configuración predeterminada lo mantiene desactivado. Al activarlo, los ajustes se comparten mediante `chrome.storage.sync`. Una instalación nueva puede leer y aplicar automáticamente una configuración de sincronización ya activada en la misma cuenta de Chrome.
- **Google Drive**: Requiere autorización de Google por separado. Conectar, actualizar la lista, crear copias, descargar, restaurar y eliminar instantáneas implica acceder a las API de Google. No hay copias automáticas programadas.

Priorizar el uso sin conexión significa que la página principal puede funcionar localmente. Al activar funciones en la nube o visitar un sitio, el servicio correspondiente recibe los datos necesarios para esa acción.

### Chrome Sync: ajustes ligeros

Sincroniza accesos directos y ajustes entre navegadores que usan la misma cuenta de Chrome, según la disponibilidad de la sincronización y sus cuotas de almacenamiento. Las imágenes incrustadas de fondos, carteles e iconos se omiten o se sustituyen por valores predeterminados en los datos sincronizados. Usa la exportación JSON o las instantáneas de Drive si necesitas incluir las imágenes.

Las URL duplicadas pueden tener posiciones independientes sin perder las coordenadas anteriores. Las copias con identidades usan el esquema 2 y requieren una versión actualizada para importarlas. Los clientes antiguos pueden eliminar estos campos; Chrome Sync conserva los datos locales y pide revisión si las copias son incompatibles. Consulta [posiciones independientes, compatibilidad y recuperación](docs/layout-identities.md).

### Google Drive: instantáneas manuales

- Conecta Google Drive desde Configuración y elige un nombre de equipo para las copias.
- Las instantáneas incluyen la configuración y las imágenes locales. Se guardan en la carpeta oculta `appDataFolder` de Drive, con el ámbito de autorización `drive.appdata`.
- Puedes consultar, descargar, restaurar o eliminar instantáneas por nombre de equipo. Tras una copia normal, la extensión intenta eliminar las más antiguas de ese equipo y conservar las 20 últimas.
- Cada instantánea tiene un límite de 25 MiB. Las que superan los 5 MiB requieren una confirmación adicional.
- Antes de restaurar desde Drive, la extensión intenta subir la configuración actual como instantánea de seguridad. Si falla, pregunta si quieres continuar. La restauración sustituye la configuración actual de este dispositivo.

Esta función depende de la API Chrome Identity, de una configuración OAuth válida y de la autorización de Google. Comprueba esa configuración en instalaciones de desarrollo o empaquetadas por tu cuenta. El uso local y la importación o exportación JSON no dependen de Drive.

### Permisos de la extensión

Los permisos declarados en [manifest.json](manifest.json) incluyen:

- `storage` y `unlimitedStorage`: configuración e imágenes locales.
- `identity` y `https://www.googleapis.com/*`: autorización y copias opcionales en Google Drive.
- El permiso opcional `https://www.google.com/*`: descarga de iconos de sitios.

## Idiomas de la documentación y de la interfaz

El README predeterminado está en [chino simplificado](README.md), con versiones en [inglés](README.en.md) y español.

La extensión incluye actualmente recursos de interfaz en chino simplificado (`_locales/zh_CN`) e inglés (`_locales/en`). Usa el idioma del navegador mediante `chrome.i18n`, con el inglés como alternativa predeterminada. El español solo está disponible en la documentación por ahora.

## Desarrollo y comprobaciones locales

El proyecto utiliza Manifest V3, JavaScript sin bibliotecas externas y CSS. No requiere instalar dependencias ni generar un paquete. Con Node.js instalado, ejecuta estos comandos desde la raíz del repositorio:

```bash
# Ejecutar todas las pruebas de regresión
node --test tests/*.test.js

# Comprobar la sintaxis JavaScript
for file in *.js shared/*.js tests/*.js tests/helpers/*.js assets/*.js; do
  node --check "$file" || exit 1
done

# Validar el manifiesto y los archivos JSON de idiomas
node -e 'const fs = require("node:fs"); for (const file of ["manifest.json", ...fs.readdirSync("_locales").map(locale => "_locales/" + locale + "/messages.json")]) JSON.parse(fs.readFileSync(file, "utf8")); console.log("JSON OK");'

git diff --check
```

Estas comprobaciones cubren regresiones de lógica, sintaxis JavaScript y validez de JSON; no sustituyen las pruebas en un navegador real. Antes de publicar, carga la extensión descomprimida y comprueba ambos idiomas de la interfaz, el uso del teclado, el arrastre, la edición entre pestañas, la restauración de copias y los flujos opcionales en línea. Consulta también la [lista de comprobación para publicar](docs/release-checklist.md).

### Estructura del código

- `newtab.html` / `newtab.css` / `newtab.js`: interfaz e interacciones de la nueva pestaña.
- `options.html` / `options.css` / `options.js`: configuración y gestión de datos.
- `storage.js`: almacenamiento local, validación, importación, exportación y Chrome Sync.
- `drive-backup.js`: instantáneas de copia de seguridad en Google Drive.
- `favicon-cache.js`: caché de iconos de sitios.
- `shared/`: lógica compartida para plantillas de búsqueda y diálogos.
- `_locales/`: traducciones de la interfaz; `assets/`: iconos y capturas; `tests/`: pruebas locales de regresión.

## Licencia

La documentación existente identifica la licencia como MIT. El repositorio todavía no incluye un archivo `LICENSE` independiente.

## Tareas locales

Activa la tarjeta opcional de Tareas en los ajustes de visibilidad de módulos. Está desactivada de forma predeterminada y comienza vacía. Permite añadir, editar y completar tareas, fijar una como siguiente acción y recuperar elementos eliminados.

Las tareas y sus copias de recuperación permanecen en este dispositivo. Las exportaciones de ajustes, Chrome Sync y las copias de Google Drive no las incluyen. Restablecer, importar o restaurar los ajustes conserva las tareas. Usa la exportación e importación independiente de tareas para hacer copias y cambiar de dispositivo. Desinstalar la extensión o borrar sus datos puede eliminar las tareas locales. [Guía de tareas (en inglés)](docs/local-tasks.en.md).

## Buscar sitios guardados

El buscador local encuentra títulos, direcciones y categorías guardados sin enviar consultas a la web. Comprueba el registro actual antes de abrirlo y no modifica la disposición ni las tareas. [Guía del buscador (en inglés)](docs/shortcut-finder.en.md).
