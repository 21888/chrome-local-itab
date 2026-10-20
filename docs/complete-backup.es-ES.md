# Copia local completa

En Ajustes → Datos → **Complete local backup**, selecciona cualquiera de siete módulos: configuración (sitios, categorías, diseño e imágenes locales), Tasks con su historial, Scratchpad, Countdown, preferencias de Focus, biblioteca global de prompts y colecciones globales de IA.

Los primeros cinco pertenecen a cada espacio de trabajo; las dos bibliotecas globales se incluyen una sola vez. Los prompts conservan registros archivados, versiones inmutables e historial de recuperación. Las colecciones conservan extractos, anotaciones, URL de origen, vínculos exactos a prompts/versiones e historial. No se exporta la visibilidad de las bibliotecas globales. Con colecciones se usa schema 4; con prompts sin colecciones, schema 3; solo espacios, schema 2. Los archivos antiguos de un solo espacio usan schema 1.

Guarda primero los cambios. No se incluyen borradores, ediciones pendientes, entradas de calculadora ni sesiones de Focus. Las exportaciones individuales siguen disponibles. Chrome Sync, Google Drive y las copias de configuración conservan su alcance anterior.

## Espacios y destinos revisados

Se incluyen todos los espacios activos y los recuperables de la papelera. Seleccionar los cinco módulos de espacios permite reemplazar la lista, nombres, orden y papelera. Una restauración parcial exige identidades coincidentes de espacios y papelera; no crea, renombra, elimina ni recupera espacios. Restaurar solo bibliotecas globales no reemplaza contenido de los espacios.

Un archivo schema 1 exige elegir explícitamente un espacio activo de destino; no permite elegir la papelera y conserva los demás espacios. Los prompts y las colecciones requieren confirmar sus destinos globales por separado. Revisa los conflictos de ID. Los vínculos conservan los ID exactos del prompt y su versión: importar colecciones sin los prompts correspondientes puede dejar vínculos sin resolver, nunca reasignados por nombre.

## Exportar y restaurar

1. Exporta los módulos seleccionados. La aplicación solo confirma la solicitud de descarga; comprueba la lista de descargas y el archivo antes de eliminar la instalación original.
2. En el destino, exporta los datos actuales y conserva cualquier borrador. Elige el JSON completo (máximo 32 MiB). Se lee localmente; validar archivos con muchas imágenes puede pausar brevemente la página.
3. Revisa módulos, cantidades entrantes/actuales y alcance. Cambiar la selección genera otra vista previa. Se reemplazan los registros actuales de los módulos seleccionados, sin fusionarlos; se conservan e importan los historiales de recuperación globales. Los demás módulos y los datos de proveedores/autenticación no cambian.
4. No se pueden restaurar las preferencias de Focus mientras exista una sesión en ejecución, pausada o interrumpida. Desmarca Focus o detén/restablece la sesión con sus controles habituales y vuelve a previsualizar.
5. Confirma **Replace selected saved modules** y espera la verificación. Los cambios concurrentes, borradores y operaciones pendientes bloquean una restauración insegura. Cancelar o un error de lectura/vista previa no reemplaza datos ni descarta borradores.
6. La recarga es manual. Conserva los borradores de esta página y otras pestañas antes de recargar.

Antes de reemplazar datos se guarda y verifica una copia de recuperación con los cinco módulos de todos los espacios, incluida la papelera, y solo las bibliotecas globales seleccionadas. Solo se conserva la más reciente; iniciar otra restauración confirmada puede sustituir esa copia aunque no finalice el reemplazo. Descarga la anterior si necesitas conservarla. El historial interno de Tasks es independiente.

Usa **Download pre-restore recovery copy** y selecciona el JSON descargado para restaurarlo mediante la misma revisión. Si la escritura final no puede verificarse, algunos datos podrían haber cambiado: comprueba el estado y la copia de recuperación antes de volver a intentarlo.

Una restauración combinada interrumpida puede dejar una marca persistente que bloquea nuevas escrituras incluso después de recargar. Usa la inspección y recuperación con confirmación independiente que ofrece la interfaz. No repitas automáticamente la importación ni supongas que recargar resuelve una escritura incierta. No se garantiza atomicidad ante un cierre inesperado del navegador.

**Download both saved copies** genera un paquete de diagnóstico con `before` y `current`; la importación ordinaria de copias completas no acepta directamente ese paquete. `before` es la copia portátil anterior verificada y vinculada a la transacción pendiente; `current` es la instantánea guardada capturada para inspección. Tras una escritura parcial puede contener valores antiguos y nuevos, incluso vínculos a prompts/versiones sin resolver. Descargarlo no repara ni fusiona esos valores, ni garantiza que el almacenamiento permanezca igual después de la captura.

Las copias portátiles de Focus y el JSON anterior a la restauración contienen preferencias, no identificadores de sesiones en ejecución ni sus plazos. Dejar Focus sin seleccionar conserva las sesiones guardadas en el destino. La recuperación de una restauración interrumpida, confirmada por separado, usa el estado original retenido y verificado de los espacios. Importar el JSON portátil no equivale a esa recuperación ni permite reanudar un temporizador anterior.

El archivo puede contener notas privadas, prompts, extractos, historial, URL completas e imágenes. Guárdalo de forma segura. Esta función no amplía permisos de red ni añade contenido privado a copias en la nube.
