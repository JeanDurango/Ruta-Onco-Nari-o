(function () {
  "use strict";

  // ===================================================================
  // Constantes
  // ===================================================================

  var MODULES = {
    PACIENTES: "Onco_Pacientes",
    CASOS: "Onco_Casos",
    EVENTOS: "Onco_Tareas", // antes "Onco_Eventos" — renombrado a pedido, ver README
    ALERTAS: "Onco_Alertas",
    CONTACTS: "Contacts"
  };

  // Onco_Tareas y Onco_Alertas todavia no existen en el CRM (se crean mas
  // adelante, paso a paso). La app arranca igual solo con Onco_Pacientes +
  // Onco_Casos + Contacts: estas banderas se detectan al cargar y apagan
  // las funciones que dependen de los modulos opcionales en vez de romper
  // el arranque. Ver bootAfterIdentify().
  var FEATURES = { eventos: false, alertas: false };

  // URL del proyecto de Zoho Catalyst (ver ruta-oncologica-catalyst/README.md
  // para desplegarlo), ej. "https://ruta-oncologica-xxxxx.catalystserverless.com".
  // Onco_Pacientes/Onco_Casos/Onco_Tareas/Onco_Alertas se leen y escriben a
  // traves de esa funcion (con su propio token OAuth de acceso completo),
  // no via ZOHO.CRM.API, porque: (a) ZOHO.CRM.FUNCTIONS.execute() esta
  // bloqueado para usuarios de Client Portal, y (b) ZOHO.CRM.API directo
  // exige compartir el modulo con el portal (aparece como pestana, que es
  // justo lo que no se quiere). Contacts sigue consultandose directo (ver
  // zSearchDirect) porque no tiene ninguno de esos dos problemas.
  var CATALYST_BASE_URL = "https://ruta-oncologica-941078117.development.catalystserverless.com";

  var ROLES = {
    GESTOR_ESE: "Gestor_ESE",
    LIDER_EPS: "Lider_EPS",
    NAVEGADOR_IPS: "Navegador_IPS",
    ADMIN: "Administrador"
  };

  var ROLE_LABELS = {
    Gestor_ESE: "Gestor de Cáncer (E.S.E.)",
    Lider_EPS: "Líder Cohorte de Cáncer (EPS)",
    Navegador_IPS: "Navegador / Gestor de casos (IPS oncológica)",
    Administrador: "Administrador"
  };

  // Ver README seccion 6: los estados marcados abajo con "asuncion:" son mi
  // resolucion de una bifurcacion que la especificacion original dejaba en
  // PENDIENTE DE DEFINICION DE NEGOCIO. Revisar con negocio antes de operar
  // en produccion.
  var EST = {
    CASO_REPORTADO: "Caso_Reportado",
    SIN_PRUEBA_ORDENADA: "Sin_Prueba_Ordenada", // asuncion: ver 6.1
    PRUEBA_AUTORIZACION_PENDIENTE: "Prueba_Autorizacion_Pendiente",
    PRUEBA_AUTORIZADA: "Prueba_Autorizada",
    PRUEBA_PROGRAMADA: "Prueba_Programada",
    PRUEBA_CONTACTO_CONFIRMADO: "Prueba_Contacto_Confirmado",
    PRUEBA_REALIZADA: "Prueba_Realizada",
    CASO_CERRADO_NO_ONCOLOGICO: "Caso_Cerrado_No_Oncologico",
    SIN_ESPECIALISTA_REQUERIDO: "Sin_Especialista_Requerido", // asuncion: ver 6.2
    VALORACION_AUTORIZACION_PENDIENTE: "Valoracion_Autorizacion_Pendiente",
    VALORACION_AUTORIZADA: "Valoracion_Autorizada",
    VALORACION_PROGRAMADA: "Valoracion_Programada",
    VALORACION_CONTACTO_CONFIRMADO: "Valoracion_Contacto_Confirmado",
    CITA_ESPECIALISTA_REALIZADA: "Cita_Especialista_Realizada",
    MALIGNIDAD_CONFIRMADA: "Malignidad_Confirmada",
    TRATAMIENTO_ORDENADO: "Tratamiento_Ordenado",
    TRATAMIENTO_INICIADO: "Tratamiento_Iniciado",
    RECAIDA: "Recaida",
    CASO_FALLECIDO: "Caso_Fallecido",
    CASO_CERRADO: "Caso_Cerrado" // asuncion: ver 6.4
  };

  var EST_LABELS = {
    Caso_Reportado: "Caso reportado",
    Sin_Prueba_Ordenada: "Sin prueba ordenada",
    Prueba_Autorizacion_Pendiente: "Esperando autorización de prueba confirmatoria",
    Prueba_Autorizada: "Prueba confirmatoria autorizada",
    Prueba_Programada: "Prueba confirmatoria programada",
    Prueba_Contacto_Confirmado: "Contacto confirmado (prueba confirmatoria)",
    Prueba_Realizada: "Prueba confirmatoria realizada",
    Caso_Cerrado_No_Oncologico: "Cerrado — no oncológico",
    Sin_Especialista_Requerido: "Seguimiento sin especialista",
    Valoracion_Autorizacion_Pendiente: "Esperando autorización de especialista",
    Valoracion_Autorizada: "Valoración autorizada",
    Valoracion_Programada: "Cita con especialista programada",
    Valoracion_Contacto_Confirmado: "Contacto confirmado (especialista)",
    Cita_Especialista_Realizada: "Cita con especialista realizada",
    Malignidad_Confirmada: "Malignidad confirmada",
    Tratamiento_Ordenado: "Tratamiento ordenado",
    Tratamiento_Iniciado: "En tratamiento",
    Recaida: "Recaída — nuevo ciclo pendiente",
    Caso_Fallecido: "Caso cerrado — fallecido",
    Caso_Cerrado: "Caso cerrado"
  };

  var TERMINALES = [EST.CASO_CERRADO_NO_ONCOLOGICO, EST.CASO_FALLECIDO, EST.CASO_CERRADO];

  // Casos con malignidad ya confirmada (incluye los ya cerrados/fallecidos
  // despues de confirmarla) -- usado para "prevalencia gestionada" y para
  // filtrar que casos tienen sentido en los indicadores de oportunidad
  // diagnostica/estadificacion/adherencia (necesitan haber pasado por
  // Malignidad_Confirmada).
  var ESTADOS_DESDE_MALIGNIDAD = [EST.MALIGNIDAD_CONFIRMADA, EST.TRATAMIENTO_ORDENADO, EST.TRATAMIENTO_INICIADO, EST.RECAIDA, EST.CASO_FALLECIDO, EST.CASO_CERRADO];
  // Igual que arriba pero sin los ya cerrados/fallecidos -- "siguen en
  // seguimiento activo" (prevalencia gestionada, no historica).
  var ESTADOS_EN_SEGUIMIENTO_CONFIRMADO = [EST.MALIGNIDAD_CONFIRMADA, EST.TRATAMIENTO_ORDENADO, EST.TRATAMIENTO_INICIADO, EST.RECAIDA];
  // Municipios de mayor incidencia de cancer segun el cliente (IDSN) --
  // referencia fija que dieron ellos, no viene de un picklist de Zoho.
  var MUNICIPIOS_ALTA_INCIDENCIA = ["Pasto", "Linares", "Sandoná", "El Charco", "Tumaco", "Ipiales"];

  var EVT = {
    REPORTE_INICIAL: "Reporte_Inicial",
    PRUEBA_AUTORIZADA: "Prueba_Autorizada",
    PRUEBA_PROGRAMADA: "Prueba_Programada",
    PRUEBA_CONTACTO_CONFIRMADO: "Prueba_Contacto_Confirmado",
    PRUEBA_REALIZADA_RESULTADO: "Prueba_Realizada_Resultado",
    VALORACION_AUTORIZADA: "Valoracion_Autorizada",
    VALORACION_PROGRAMADA: "Valoracion_Programada",
    VALORACION_CONTACTO_CONFIRMADO: "Valoracion_Contacto_Confirmado",
    CITA_ESPECIALISTA_REALIZADA: "Cita_Especialista_Realizada",
    MALIGNIDAD_CONFIRMADA: "Malignidad_Confirmada",
    ESTADIFICACION: "Estadificacion",
    TRATAMIENTO_ORDENADO: "Tratamiento_Ordenado",
    TRATAMIENTO_INICIADO: "Tratamiento_Iniciado",
    RECAIDA: "Recaida",
    FALLECIMIENTO: "Fallecimiento",
    CIERRE_CASO: "Cierre_Caso",
    COMENTARIO: "Comentario"
  };

  // needs: "ips" pide seleccionar la IPS oncologica; "eps" se resuelve solo
  // (usa la EPS ya registrada del paciente); "auto" se autoasigna a quien
  // reporta; "auto_gestor" se asigna siempre al Gestor ESE que reporto el
  // caso (Institucion_Reportante), sin importar quien reporte la barrera.
  var BARRERAS = [
    { value: "Sin_Agenda_Especialista", label: "Sin agenda para cita de especialista u otra cita relacionada", needs: "ips" },
    { value: "Sin_Cita_Quimioterapia", label: "Sin cita para quimioterapia", needs: "ips" },
    { value: "Sin_Autorizacion_EPS", label: "Sin autorización de la EPS (cita, examen, procedimiento o medicamento)", needs: "eps" },
    { value: "Sin_Dispensacion_Medicamento", label: "Sin dispensación de medicamento", needs: "eps" },
    { value: "Sin_Acompanante_Traslado", label: "Sin acompañante o recurso para traslado", needs: "auto" },
    { value: "Paciente_No_Contactable", label: "Paciente no contactable / inasistente recurrente", needs: "auto_gestor" },
    { value: "Paciente_Negacion", label: "Paciente en negación de la enfermedad o el tratamiento", needs: "auto" }
  ];

  var FALLBACK_PICKLISTS = {
    Municipio: ["Pasto", "Albán", "Aldana", "Ancuya", "Arboleda", "Barbacoas", "Belén", "Buesaco", "Chachagüí", "Colón", "Consacá", "Contadero", "Córdoba", "Cuaspud", "Cumbal", "Cumbitara", "El Charco", "El Peñol", "El Rosario", "El Tablón de Gómez", "El Tambo", "Francisco Pizarro", "Funes", "Guachucal", "Gualmatán", "Guaitarilla", "Iles", "Imués", "Ipiales", "La Cruz", "La Florida", "La Llanada", "La Tola", "La Unión", "Leiva", "Linares", "Los Andes", "Magüí Payán", "Mallama", "Mosquera", "Nariño", "Olaya Herrera", "Ospina", "Policarpa", "Potosí", "Providencia", "Puerres", "Pupiales", "Ricaurte", "Roberto Payán", "Samaniego", "San Bernardo", "San Lorenzo", "San Pablo", "San Pedro de Cartago", "Sandoná", "Santa Bárbara", "Santacruz", "Sapuyes", "Taminango", "Tangua", "Tumaco", "Túquerres", "Yacuanquer"],
    // Catalogo oficial CIE-10 de diagnosticos/sospechas oncologicas dado por
    // el cliente (223 codigos) -- reemplaza la lista generica anterior.
    Tipo_Cancer: ["C01X - Tumor maligno de la base de la lengua", "C03 - Tumor maligno encia", "C050 - Tumor maligno del paladar duro", "C069 - Tumor maligno de la boca, parte no especificada", "C099 - Tumor maligno de la amigdala, parte no especificada", "C109 - Tumor maligno de la orofaringe, parte no especificada", "C151 - Tumor maligno del esofago, porcion toracica", "C159 - Tumor maligno del esofago, parte no especificada", "C160 - Tumor maligno del cardias", "C161 - Tumor maligno del fundus gastrico", "C162 - Tumor maligno del cuerpo del estomago", "C163 - Tumor maligno del antro pilorico", "C164 - Tumor maligno del piloro", "C165 - Tumor maligno de la curvatura menor del estomago, sin otra especificacion", "C166 - Tumor maligno de la curvatura mayor del estomago, sin otra especificacion", "C168 - Lesion de sitios contiguos del estomago", "C169 - Tumor maligno del estomago, parte no especificada", "C170 - Tumor maligno del duodeno", "C179 - Tumor maligno del intestino delgado, parte no especificada", "C180 - Tumor maligno del ciego", "C181 - Tumor maligno del apendice", "C182 - Tumor maligno del colon ascendente", "C183 - Tumor maligno del angulo hepatico", "C184 - Tumor maligno del colon transverso", "C185 - Tumor maligno del angulo esplenico", "C187 - Tumor maligno del colon sigmoide", "C188 - Lesion de sitios contiguos del colon", "C189 - Tumor maligno del colon, parte no especificada", "C19X - Tumor maligno de la unión rectosigmoidea", "C20X - Tumor maligno del recto", "C210 - Tumor maligno del ano, parte no especificada", "C211 - Tumor maligno del conducto anal", "C212 - Tumor maligno de la zona cloacogenica", "C218 - Lesion de sitios contiguos del ano, del conducto anal y del recto", "C229 - Tumor maligno del higado, no especificado", "C23X - Cancer de vesicula", "C249 - Tumor maligno de las vias biliares, parte no especificada", "C250 - Tumor maligno de la cabeza del pancreas", "C259 - Tumor maligno del pancreas, parte no especificada", "C323 - Tumor maligno del cartílago laríngeo", "C329 - Tumor maligno de laringe", "C33X - Tumor maligno de la tráquea", "C340 - Tumor maligno del bronquio principal", "C341 - Tumor maligno del lobulo superior, bronquio o pulmon", "C342 - Tumor maligno del lobulo medio, bronquio o pulmon", "C343 - Tumor maligno del lobulo inferior, bronquio o pulmon", "C348 - Lesion de sitios contiguos de los bronquios y del pulmon", "C349 - Tumor maligno de los bronquios o del pulmon, parte no especificada", "C381 - Tumor maligno del mediastino anterior", "C410 - Tumor maligno de los huesos del craneo y de la cara", "C414 - Tumor maligno de los huesos de la pelvis, sacro y coccix", "C419 - Tumor maligno del hueso y del cartílago articular, no especificado", "C430 - Melanoma maligno del labio", "C431 - Melanoma maligno del parpado, incluida la comisura palpebral", "C432 - Melanoma maligno de la oreja y del conducto auditivo externo", "C433 - Melanoma maligno de las otras partes y las no especificadas de la cara", "C434 - Melanoma maligno del cuero cabelludo y del cuello", "C435 - Melanoma maligno del tronco", "C436 - Melanoma maligno del miembro superior, incluido el hombro", "C437 - Melanoma maligno del miembro inferior, incluida la cadera", "C438 - Melanoma maligno de sitios contiguos de la piel", "C439 - Melanoma maligno de piel, sitio no especificado", "C442 - Tumor maligno de la piel de la oreja y del conducto auditivo externo", "C443 - Tumor maligno de la piel de otras partes y de las no especificadas de la cara", "C447 - Tumor maligno de la piel, sitio no especificado", "C450 - Mesotelioma de la pleura", "C469 - Sarcoma de kaposi, de sitio no especificado", "C492 - Tumor maligno del tejido conjuntivo y tejido blando del miembro inferior, incluida la cadera", "C493 - Tumor maligno del tejido conjuntivo y tejido blando del torax", "C494 - Tumor maligno del tejido conjuntivo y tejido blando del abdomen", "C499 - Tumor maligno del tejido conjuntivo y tejido blando, de sitio no especificado", "C500 - Tumor maligno del pezon y areola mamaria", "C501 - Tumor maligno de la porcion central de la mama", "C502 - Tumor maligno del cuadrante superior interno de la mama", "C503 - Tumor maligno del cuadrante inferior interno de la mama", "C504 - Tumor maligno del cuadrante superior externo de la mama", "C505 - Tumor maligno del cuadrante inferior externo de la mama", "C506 - Tumor maligno de la prolongacion axilar de la mama", "C508 - Lesion de sitios contiguos de la mama", "C509 - Tumor maligno de la mama, parte no especificada", "C518 - Lesion de sitios contiguos de la vulva", "C519 - Tumor maligno de la vulva, parte no especificada", "C530 - Tumor maligno del endocervix", "C531 - Tumor maligno de exocervix", "C538 - Lesion de sitios contiguos del cuello del utero", "C539 - Tumor maligno del cuello del utero, sin otra especificacion", "C541 - Tumor maligno del endometrio", "C56X - Tumor maligno de ovario", "C61X - Tumor maligno de la próstata", "C64X - Tumor maligno del riñón, excepto de la pelvis renal", "C679 - Tumor maligno de la vejiga urinaria, parte no especificada", "C696 - Tumor maligno de la orbita", "C710 - Tumor maligno del cerebro, excepto lobulos y ventriculos", "C719 - Tumor maligno del encefalo, parte no especificada", "C729 - Tumor maligno del sistema nervioso central, sin otra especificación", "C73X - Tumor maligno de la glándula tiroides", "C760 - Tumor maligno de la cabeza, cara y cuello", "C770 - Tumor maligno de los ganglios linfáticos de la cabeza, cara y cuello", "C779 - Tumor maligno del ganglio linfatico, sitio no especificado", "C780 - Tumor maligno secundario pulmon", "C786 - Tumor maligno secundario del peritoneo y del retroperitoneo", "C795 - Tumor maligno secundario de los huesos y de la médula ósea", "C809 - Tumor maligno, sitio primario no especificado", "C80X - Tumor maligno de sitios no especificados", "C810 - Enfermedad de hodgkin con predominio linfocitico", "C811 - Enfermedad de hodgkin con esclerosis nodular", "C812 - Enfermedad de hodgkin con celularidad mixta", "C813 - Enfermedad de hodgkin con deplecion linfocitica", "C814 - Linfoma de hodgkin clásico rico en linfocitos", "C817 - Otros tipos de enfermedad de hodgkin", "C819 - Enfermedad de hodgkin, no especificada", "C820 - Linfoma no hodgkin de celulas pequeñas hendidas, folicular", "C821 - Linfoma no hodgkin mixto, de pequeñas celulas hendidas y de grandes celulas, folicular", "C822 - Linfoma no hodgkin de celulas grandes, folicular", "C823 - Linfoma folicular grado iiia", "C824 - Linfoma folicular grado iiib", "C825 - Linfoma centro folicular difuso", "C826 - Linfoma centro folicular cutáneo", "C827 - Otros tipos especificados de linfoma no hodgkin folicular", "C829 - Linfoma no hodgkin folicular, sin otra especificacion", "C830 - Linfoma no hodgkin de celulas pequeñas (difuso)", "C831 - Linfoma no hodgkin de celulas pequeñas hendidas (difuso)", "C832 - Linfoma no hodgkin mixto, de celulas pequeñas y grandes (difuso)", "C833 - Linfoma no hodgkin de celulas grandes (difuso)", "C834 - Linfoma no hodgkin inmunoblastico (difuso)", "C835 - Linfoma no hodgkin linfoblastico (difuso)", "C836 - Linfoma no hodgkin indiferenciado (difuso)", "C837 - Tumor de burkitt", "C838 - Otros tipos especificados de linfoma no hodgkin difuso", "C839 - Linfoma no hodgkin difuso, sin otra especificacion", "C840 - Micosis fungoide", "C841 - Enfermedad de sezary", "C842 - Linfoma de zona t", "C843 - Linfoma linfoepitelioide", "C844 - Linfoma de celulas t periferico", "C845 - Otros linfomas de celulas y los no especificados", "C846 - Linfoma anaplásico de células grandes alk-positivo", "C847 - Linfoma anaplásico de células grandes alk-negativo", "C848 - Linfoma cutáneo de células t, no especificado", "C849 - Linfoma de células t/nk maduras, no especificado", "C850 - Linfosarcoma", "C851 - Linfoma de celulas b, sin otra especificacion", "C852 - Linfoma mediastinal de células b grandes (del timo)", "C857 - Otros tipos especificados de linfoma no hodgkin", "C859 - Linfoma no hodgkin, no especificado", "C860 - Linfoma extranodal de células t/nk, tipo nasal", "C861 - Linfoma hepatoesplénico de células t", "C862 - Linfoma de células t tipo enteropatía (intestinal)", "C863 - Linfoma de células t tipo paniculitis subcutánea", "C864 - Linfoma blástico de células nk", "C865 - Linfoma angioinmunoblástico de células t", "C866 - Trastornos linfoproliferativos primario cutáneos de células t cd30-positivo", "C884 - Linfoma de células b extranodal de zona marginal de tejido linfoide asociado a mucosas [linfoma tlam]", "C900 - Mieloma multiple", "C902 - Plasmocitoma extramedular", "C910 - Leucemia linfoblastica aguda", "C911 - Leucemia linfocitica cronica", "C914 - Leucemia de celulas vellosas", "C918 - Leucemia tipo burkitt de células b maduras", "C920 - Leucemia mieloide aguda", "C921 - Leucemia mieloide crónica", "C924 - Leucemia promielocitica aguda", "C925 - Leucemia mielomonocitica aguda", "C926 - Leucemia mieloide aguda con anormalidad 11q23", "C928 - Leucemia mieloide aguda con displasia multilinaje", "C930 - Leucemia monocitica aguda", "C933 - Leucemia mielomonocítica juvenil", "C940 - Eritremia aguda y eritroleucemia", "C942 - Leucemia megacarioblastica aguda", "C944 - Panmielosis aguda", "C960 - Enfermedad de letterer", "C961 - Histiocitosis maligna", "C962 - Tumor maligno de mastocitos", "C963 - Linfoma histiocitico verdadero", "C967 - Otros tumores malignos especificados del tejido linfatico, hematopoyetico y tejidos afines", "C969 - Tumor maligno del tejido linfatico, hematopoyetico y tejidos afines, sin otra especificacion", "D002 - Carcinoma in situ del estomago", "D010 - Carcinoma in situ del colon", "D011 - Carcinoma in situ de la union rectosigmoidea", "D012 - Carcinoma in situ del recto", "D013 - Carcinoma in situ del ano y del conducto anal", "D021 - Carcinoma in situ de la traquea", "D022 - Carcinoma in situ del bronquio y del pulmon", "D030 - Melanoma in situ del labio", "D031 - Melanoma in situ del parpado y de la comisura palpebral", "D032 - Melanoma in situ de la oreja y del conducto auditivo externo", "D033 - Melanoma in situ de otras partes y de las no especificadas de la cara", "D034 - Melanoma in situ del cuero cabelludo y del cuello", "D035 - Melanoma in situ del tronco", "D036 - Melanoma in situ del miembro superior, incluido el hombro", "D037 - Melanoma in situ del miembro inferior, incluida la cadera", "D038 - Melanoma in situ de otros sitios", "D039 - Melanoma in situ, sitio no especificado", "D042 - Carcinoma in situ de la piel de otras partes y de las no especificadas de la cara", "D043 - Carcinoma in situ de la piel de otras partes y de las no especificadas de la cara", "D048 - Carcinoma in situ de la piel de otros sitios especificados", "D050 - Carcinoma in situ lobular", "D051 - Carcinoma in situ intracanalicular", "D057 - Otros carcinomas in situ de la mama", "D059 - Carcinoma in situ de la mama, parte no especificada", "D060 - Carcinoma in situ del endocervix", "D061 - Carcinoma in situ del exocervix", "D067 - Carcinoma in situ de otras partes especificadas del cuello del utero", "D069 - Carcinoma in situ del cuello del utero, parte no especificada", "D075 - Carcinoma in situ de la prostata", "D092 - Carcinoma in situ del ojo", "D214 - Tumor benigno del tejido conjuntivo y otros tejidos blandos del abdomen", "D383 - Tumor de comportamiento incierto o desconocido del mediastino", "D391 - Tumor de comportamiento incierto o desconocido del ovario", "D440 - Tumor de comportamiento incierto o desconocido de la glándula tiroides", "D45X - Policitemia vera", "D467 - Otros sindromes mielodisplasicos", "D469 - Síndrome mielodisplasico sin otra especificación", "D471 - Enfermedad mieloproliferativa crónica", "D485 - Tumor de comportamiento incierto o desconocido de la piel", "D760 - Histiocitosis de las celulas de langerhans", "D830 - Inmunodeficiencia variable común con predominio de anormalidades en el número y la función de los linfocitos b", "E078 - Otros trastornos especificados de la glándula tiroides", "M728 - Otros trastornos fibroblasticos", "N63X - Masa no especificada en la mama", "N872 - Displasia cervical severa, no clasificada en otra parte", "Z123 - Examen de pesquisa especial para tumor de la mama", "Z859 - Historia personal de tumor maligno, de sitio no especificado"],
    // Catalogo oficial de EAPB con ruta interna de cancer en Nariño, dado
    // por el IDSN (Compromiso N.4, "Respuesta a Compromisos OncoAPP.pdf") --
    // reemplaza la lista anterior (tenia 9, incluia FAMISANAR/Sanidad
    // Militar/Policial que no estan en la lista oficial).
    Asegurador_EPS: ["ASMET SALUD", "EMSSANAR", "NUEVA EPS", "SANITAS EPS", "FOMAG", "MALLAMAS EPS-I"],
    Tipo_Documento: ["Cédula de ciudadanía", "Cédula de extranjería", "Pasaporte", "Registro Civil", "Tarjeta de identidad", "Permiso por protección temporal"],
    Regimen_Afiliacion: ["Contributivo", "Subsidiado", "Especial", "Excepcion", "No_Afiliado"],
    Grupo_Poblacional: ["Persona discapacitada", "Víctima de conflicto", "NRAP", "Indígena", "Menor de 18 años", "Desmovilizado", "Persona mayor", "Migrante"],
    Factores_Criticidad: ["Analfabeta", "Antecedente familiar de cáncer", "Antecedente personal de cáncer", "Madre cabeza de familia", "No habla español", "Otras comorbilidades de base", "Pobre sin capacidad de pago / Desempleado", "Sin red de apoyo", "N/A"],
    // Catalogo oficial de instituciones con servicios oncologicos en Nariño,
    // dado por el IDSN (Compromiso N.4, "Respuesta a Compromisos OncoAPP.pdf")
    // -- reemplaza el catalogo provisional de 10 nombres genericos.
    Ips_Oncologica: ["Fundación Hospital San Pedro – UFCA", "Hospital Universitario Departamental de Nariño (HUDN)", "Clínica Cardioneurovascular Pabón (atención adulta e infantil)", "Clínica Oncológica Aurora", "Instituto Cancerológico de Nariño (ICN)", "Hospital Infantil Los Ángeles – UACAI"]
  };

  // Catalogos fijos (no dependen de un picklist editable en Zoho): estadios
  // clinicos estandar y la pregunta si/no de adherencia a guia de manejo.
  var ESTADIOS_CLINICOS = ["I", "II", "III", "IV", "No determinado"];
  var HORARIOS_CONTACTO = ["Mañana", "Tarde", "Noche", "Cualquier hora"];

  var IDENTIFY_KEY = "onco_identify_override";

  // ===================================================================
  // Estado de la app / helpers
  // ===================================================================

  var app = {
    currentUser: null,
    picklists: {},
    casos: [],
    pacientesById: {},
    pacientesLista: [],
    alertas: [],
    route: { name: null, params: {} },
    lastListRoute: null,
    setupWarnings: []
  };
  var els = {};

  function $(id) { return document.getElementById(id); }
  function h(strings) { return strings; } // no-op, solo para legibilidad de templates largos
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeData(resp) { return resp && Array.isArray(resp.data) ? resp.data : []; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function nowIso() { return toZohoDateTime(new Date()); }
  function toZohoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function toZohoDateTime(d) {
    var offsetMin = -d.getTimezoneOffset();
    var sign = offsetMin >= 0 ? "+" : "-";
    var abs = Math.abs(offsetMin);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
      sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }
  function fmtDate(v) {
    if (!v) return "-";
    var d = new Date(v);
    if (isNaN(d)) return "-";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtDateShort(v) {
    if (!v) return "-";
    var d = new Date(v);
    if (isNaN(d)) return "-";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }
  function daysSince(v) {
    if (!v) return null;
    var d = new Date(v);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }
  function initialsOf(nombre) {
    var parts = (nombre || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "--";
    var a = parts[0].charAt(0);
    var b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
    return (a + b).toUpperCase();
  }
  function todayInputValue() { return toZohoDate(new Date()); }

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  function openModal(html) {
    var root = $("modal-root");
    root.innerHTML = '<div class="modal-overlay" id="active-modal-overlay">' + html + "</div>";
    root.querySelector("#active-modal-overlay").addEventListener("click", function (evt) {
      if (evt.target.id === "active-modal-overlay") closeModal();
    });
  }
  function closeModal() { $("modal-root").innerHTML = ""; }

  // ===================================================================
  // Iconos (SVG inline, mismo estilo del mockup)
  // ===================================================================

  function icon(name, size) {
    size = size || 17;
    var paths = {
      inbox: '<path d="M4 12h4l2 3h4l2-3h4"/><path d="M4 12l1-7h14l1 7v6H4z"/>',
      file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
      users: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
      bars: '<rect x="4" y="12" width="4" height="8"/><rect x="10" y="6" width="4" height="14"/><rect x="16" y="9" width="4" height="11"/>',
      bell: '<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      chevronDown: '<path d="M6 9l6 6 6-6"/>',
      chevronLeft: '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
      check: '<path d="M5 13l4 4 10-10"/>',
      warning: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.7 3.86a2 2 0 0 0-3.4 0Z"/>',
      contact: '<path d="M6 3h4l1 5-3 2c1 3 3 5 6 6l2-3 5 1v4c0 1-1 2-2 2C10 20 4 14 4 5c0-1 1-2 2-2z"/>',
      send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
      close: '<path d="M18 6 6 18M6 6l12 12"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>'
    };
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || "") + "</svg>";
  }

  // ===================================================================
  // Llamadas a Zoho
  // ===================================================================

  // Solo para Contacts: es el modulo base del portal (ya visible/accesible
  // por defecto, no necesita compartirse ni tiene el problema de "aparece
  // como pestana"), asi que se consulta directo con ZOHO.CRM.API en vez de
  // pasar por el proxy -- onco_buscar (Deluge) ademas restringe su lista
  // blanca a los 4 modulos de Onco_*, Contacts a proposito no esta ahi.
  function zSearchDirect(module, criteria) {
    return ZOHO.CRM.API.searchRecord({ Entity: module, Type: "criteria", Query: criteria }).then(safeData);
  }

  // Onco_Pacientes/Onco_Casos/Onco_Tareas/Onco_Alertas pasan por la funcion
  // de Zoho Catalyst (ver ruta-oncologica-catalyst/README.md), que llama a
  // la API REST v2 estandar de Zoho con su propio token OAuth -- por eso
  // estas tres devuelven exactamente la misma forma que devolvia
  // ZOHO.CRM.API (data:[...] para busquedas, data:[{code,details:{id}}]
  // para crear/actualizar): la funcion de Catalyst solo reenvia la
  // respuesta real de Zoho, no la transforma.
  // ===================================================================
  // Modo local de pruebas: base de datos ficticia en memoria
  // ===================================================================
  // Cuando la app corre fuera de un iframe de Zoho (ver iniciarModoLocal,
  // mas abajo) no hay sesion de portal ni backend al que llamar -- en vez de
  // depender de CORS/credenciales reales, zSearch/zInsert/zUpdate quedan
  // interceptados para leer y escribir sobre este objeto MOCK. Es un demo con
  // datos ficticios: no toca Zoho ni Catalyst para nada.
  //
  // Se persiste en sessionStorage (no solo en memoria) porque cambiar de rol
  // (ver entrarComoPerfilLocal) recarga la pagina -- sin esto, un caso
  // reportado como Gestor desaparecia al cambiar a Lider EPS para aprobarlo,
  // justo el flujo que un demo "de principio a fin" necesita mostrar.
  var MOCK = null;
  var MOCK_DATA_KEY = "onco_modo_local_db";
  function guardarMock() {
    try { sessionStorage.setItem(MOCK_DATA_KEY, JSON.stringify(MOCK)); } catch (e) {}
  }
  function cargarMockGuardado() {
    try {
      var raw = sessionStorage.getItem(MOCK_DATA_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function reiniciarDatosDemo() {
    try { sessionStorage.removeItem(MOCK_DATA_KEY); } catch (e) {}
    location.reload();
  }

  function mockId() { return "local_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }

  function mockMatch(record, criterio) {
    var clauses = [];
    var re = /\(([^:()]+):([^:()]+):([^()]*)\)/g;
    var m;
    while ((m = re.exec(criterio))) clauses.push({ field: m[1], op: m[2], value: m[3] });
    return clauses.every(function (c) {
      var raw = record[c.field];
      var val = raw && typeof raw === "object" ? raw.id : raw;
      val = val == null ? "" : String(val);
      if (c.op === "equals") return val === c.value;
      if (c.op === "in") return c.value.split(",").indexOf(val) !== -1;
      return false;
    });
  }

  function construirMockData() {
    var ESE = ["E.S.E. Aldana", "E.S.E. Ancuya", "E.S.E. Arboleda", "E.S.E. Buesaco", "E.S.E. Chachagüí", "E.S.E. Colón", "E.S.E. Consacá", "E.S.E. Córdoba", "E.S.E. Cumbal", "E.S.E. Cumbitara", "E.S.E. El Charco", "E.S.E. El Contadero", "E.S.E. El Tablón de Gómez", "E.S.E. Funes", "E.S.E. Imués", "E.S.E. La Llanada", "E.S.E. La Tola", "E.S.E. La Unión", "E.S.E. Los Andes Sotomayor", "E.S.E. Mosquera", "E.S.E. Pasto", "E.S.E. Potosí", "E.S.E. Pupiales", "E.S.E. San Bernardo", "E.S.E. San Lorenzo", "E.S.E. San Pedro de Cartago", "E.S.E. Santacruz Guachavez", "E.S.E. Sapuyes", "E.S.E. Taminango", "E.S.E. Yacuanquer"];
    var EPS = FALLBACK_PICKLISTS.Asegurador_EPS;
    var IPS = FALLBACK_PICKLISTS.Ips_Oncologica;
    var MUNICIPIOS = FALLBACK_PICKLISTS.Municipio;
    var TIPOS_CANCER = FALLBACK_PICKLISTS.Tipo_Cancer;
    var NOMBRES_F = ["María", "Luz", "Ana", "Carmen", "Diana", "Paola", "Sandra", "Claudia", "Rocío", "Yolanda", "Liliana", "Patricia"];
    var NOMBRES_M = ["Carlos", "Jairo", "Luis", "Jorge", "Fernando", "Álvaro", "Edgar", "Hernán", "William", "Mauricio", "Hugo", "Rodrigo"];
    var APELLIDOS = ["Rosero", "Ortega", "Burbano", "Getial", "Benavides", "Cerón", "Delgado", "Enríquez", "Guerrero", "Hidalgo", "Insuasty", "Jurado", "Lagos", "Montenegro", "Narváez", "Ordóñez", "Portilla", "Realpe", "Santacruz", "Villota"];
    var ESTADO_A_EVENTO = {};
    ESTADO_A_EVENTO[EST.CASO_REPORTADO] = EVT.REPORTE_INICIAL;
    ESTADO_A_EVENTO[EST.SIN_PRUEBA_ORDENADA] = EVT.REPORTE_INICIAL;
    ESTADO_A_EVENTO[EST.PRUEBA_AUTORIZACION_PENDIENTE] = EVT.REPORTE_INICIAL;
    ESTADO_A_EVENTO[EST.PRUEBA_AUTORIZADA] = EVT.PRUEBA_AUTORIZADA;
    ESTADO_A_EVENTO[EST.PRUEBA_PROGRAMADA] = EVT.PRUEBA_PROGRAMADA;
    ESTADO_A_EVENTO[EST.PRUEBA_CONTACTO_CONFIRMADO] = EVT.PRUEBA_CONTACTO_CONFIRMADO;
    ESTADO_A_EVENTO[EST.PRUEBA_REALIZADA] = EVT.PRUEBA_REALIZADA_RESULTADO;
    ESTADO_A_EVENTO[EST.CASO_CERRADO_NO_ONCOLOGICO] = EVT.PRUEBA_REALIZADA_RESULTADO;
    ESTADO_A_EVENTO[EST.SIN_ESPECIALISTA_REQUERIDO] = EVT.PRUEBA_REALIZADA_RESULTADO;
    ESTADO_A_EVENTO[EST.VALORACION_AUTORIZACION_PENDIENTE] = EVT.PRUEBA_REALIZADA_RESULTADO;
    ESTADO_A_EVENTO[EST.VALORACION_AUTORIZADA] = EVT.VALORACION_AUTORIZADA;
    ESTADO_A_EVENTO[EST.VALORACION_PROGRAMADA] = EVT.VALORACION_PROGRAMADA;
    ESTADO_A_EVENTO[EST.VALORACION_CONTACTO_CONFIRMADO] = EVT.VALORACION_CONTACTO_CONFIRMADO;
    ESTADO_A_EVENTO[EST.CITA_ESPECIALISTA_REALIZADA] = EVT.CITA_ESPECIALISTA_REALIZADA;
    ESTADO_A_EVENTO[EST.MALIGNIDAD_CONFIRMADA] = EVT.MALIGNIDAD_CONFIRMADA;
    ESTADO_A_EVENTO[EST.TRATAMIENTO_ORDENADO] = EVT.TRATAMIENTO_ORDENADO;
    ESTADO_A_EVENTO[EST.TRATAMIENTO_INICIADO] = EVT.TRATAMIENTO_INICIADO;
    ESTADO_A_EVENTO[EST.RECAIDA] = EVT.RECAIDA;
    ESTADO_A_EVENTO[EST.CASO_FALLECIDO] = EVT.FALLECIMIENTO;
    ESTADO_A_EVENTO[EST.CASO_CERRADO] = EVT.CIERRE_CASO;

    function pick(arr, i) { return arr[i % arr.length]; }
    function diasAtras(n) { return nowIsoDesplazado(-n); }
    function nowIsoDesplazado(dias) { var d = new Date(); d.setDate(d.getDate() + dias); return toZohoDateTime(d); }

    var db = { Onco_Pacientes: [], Onco_Casos: [], Onco_Tareas: [], Onco_Alertas: [] };
    var estados = Object.keys(EST).map(function (k) { return EST[k]; });
    var N = 60;
    for (var i = 0; i < N; i++) {
      var genero = i % 2 === 0 ? "Femenino" : "Masculino";
      var nombre = genero === "Femenino" ? pick(NOMBRES_F, i) : pick(NOMBRES_M, i);
      var pacienteId = mockId();
      var municipio = pick(MUNICIPIOS, i);
      var eps = pick(EPS, i);
      var ips = pick(IPS, i);
      var ese = pick(ESE, i);
      var estado = estados[i % estados.length];
      var esTerminal = TERMINALES.indexOf(estado) !== -1;
      var esInicial = estado === EST.CASO_REPORTADO || estado === EST.SIN_PRUEBA_ORDENADA;

      db.Onco_Pacientes.push({
        id: pacienteId,
        Name: nombre + " " + pick(APELLIDOS, i) + " " + pick(APELLIDOS, i + 5),
        Nombres: nombre,
        Apellidos: pick(APELLIDOS, i) + " " + pick(APELLIDOS, i + 5),
        Tipo_Documento: pick(FALLBACK_PICKLISTS.Tipo_Documento, i),
        Numero_Documento: String(100000000 + i * 37),
        Edad: 20 + (i * 7) % 65,
        Genero: genero,
        Regimen_Afiliacion: pick(FALLBACK_PICKLISTS.Regimen_Afiliacion, i),
        Asegurador_EPS: eps,
        Municipio: municipio,
        Ips_Atencion_Actual: ips,
        Telefono_1: "300" + String(1000000 + i * 37).slice(-7),
        Correo: "paciente.demo" + (i + 1) + "@local.test",
        Direccion: "Calle " + (10 + i) + " # " + (3 + i) + "-" + (20 + i) + ", " + municipio,
        Recomendaciones_Comunicacion: pick(HORARIOS_CONTACTO, i),
        Tipo_Cancer: pick(TIPOS_CANCER, i),
        Factores_Criticidad: [pick(FALLBACK_PICKLISTS.Factores_Criticidad, i)],
        Grupo_Poblacional: i % 3 === 0 ? [pick(FALLBACK_PICKLISTS.Grupo_Poblacional, i)] : []
      });

      var casoId = mockId();
      var diasReporte = 2 + (i * 5) % 85;
      var casoRec = {
        id: casoId,
        Name: "CASO-" + String(1000 + i),
        Paciente: { id: pacienteId },
        Estado_Actual: estado,
        Institucion_Reportante: ese,
        Reportado_Por: "demo.gestor" + (i % 5) + "@ese-demo.test",
        Fecha_de_Reporte: diasAtras(diasReporte),
        Eps_Actual: eps,
        Municipio: municipio,
        Siguiente_Paso: siguientePasoTexto(estado)
      };
      if (!esInicial) {
        casoRec.Ips_Oncologica_Actual = ips;
        var diasUltima = esTerminal ? (1 + i % 10) : (i % 4 === 0 ? (9 + i % 15) : (1 + i % 6));
        casoRec.Ultima_Actualizacion = diasAtras(Math.min(diasUltima, diasReporte));
      }
      if (estado === EST.CASO_FALLECIDO) casoRec.Resultado_Cierre = "Fallecido";
      if (estado === EST.CASO_CERRADO) casoRec.Resultado_Cierre = pick(["Curado Remision", "Traslado", "Abandono", "Otro"], i);
      db.Onco_Casos.push(casoRec);

      db.Onco_Tareas.push({
        id: mockId(),
        Caso: { id: casoId },
        Tipo_Evento: ESTADO_A_EVENTO[estado] || EVT.COMENTARIO,
        Fecha_Evento: toZohoDate(new Date(Date.now() - Math.min(1, diasReporte) * 86400000)),
        Registrado_Por: casoRec.Reportado_Por,
        Rol_Registro: ROLES.GESTOR_ESE,
        Institucion_Registro: ese,
        Comentario: "Evento de demo generado localmente."
      });

      if (!esTerminal && i % 6 === 0) {
        var barrera = BARRERAS[i % BARRERAS.length];
        db.Onco_Alertas.push({
          id: mockId(),
          Caso: { id: casoId },
          Tipo_Barrera: barrera.value,
          Disparada_Por: casoRec.Reportado_Por,
          Institucion_Disparada_Por: ese,
          Destinatario_Rol: barrera.needs === "ips" ? ROLES.NAVEGADOR_IPS : barrera.needs === "eps" ? ROLES.LIDER_EPS : ROLES.GESTOR_ESE,
          Destinatario_Institucion: barrera.needs === "ips" ? ips : barrera.needs === "eps" ? eps : ese,
          Ips_Relacionada: barrera.needs === "ips" ? ips : "",
          Eps_Relacionada: barrera.needs === "eps" ? eps : "",
          Detalle: "Barrera de demo generada localmente.",
          Estado: i % 12 === 0 ? "Atendida" : "Pendiente",
          Fecha_Creacion: diasAtras(1 + i % 20)
        });
      }
    }
    return db;
  }

  function zSearch(module, criteria) {
    if (MOCK) {
      var rows = (MOCK[module] || []).filter(function (r) { return mockMatch(r, criteria); });
      return Promise.resolve(rows.slice());
    }
    if (!CATALYST_BASE_URL) {
      var errCfg = new Error("Falta configurar CATALYST_BASE_URL en app.js con la URL del proyecto de Catalyst (ver ruta-oncologica-catalyst/README.md).");
      errCfg.ownMessage = true;
      return Promise.reject(errCfg);
    }
    var url = CATALYST_BASE_URL + "/server/oncoApi/buscar?modulo=" + encodeURIComponent(module) + "&criterio=" + encodeURIComponent(criteria);
    return fetch(url).then(function (resp) { return resp.json(); }).then(function (json) {
      if (json && json.error) throw new Error(json.error + (json.modulo ? " (" + json.modulo + ")" : ""));
      // Si Zoho devolvio un error (token invalido, criterio invalido, etc.)
      // la funcion de Catalyst lo reenvia tal cual -- no trae "data" como
      // arreglo en ese caso, a diferencia de una busqueda vacia valida
      // ({"data": []}), que si lo trae.
      if (!json || !Array.isArray(json.data)) throw new Error((json && json.message) || "Respuesta inesperada de Zoho: " + JSON.stringify(json));
      return json.data;
    });
  }
  // Content-Type "text/plain" a proposito (no "application/json"): un POST
  // con JSON dispara un preflight (OPTIONS) que Catalyst intercepta a nivel
  // de plataforma antes de que llegue a la funcion, sin los headers CORS
  // necesarios (confirmado en vivo) -- "text/plain" es "simple" y evita el
  // preflight. La funcion de Catalyst ya espera el texto y lo parsea ella.
  function zInsert(module, data) {
    if (MOCK) {
      var rec = Object.assign({ id: mockId() }, data);
      MOCK[module] = MOCK[module] || [];
      MOCK[module].unshift(rec);
      guardarMock();
      return Promise.resolve(rec.id);
    }
    if (!CATALYST_BASE_URL) return Promise.reject(new Error("Falta configurar CATALYST_BASE_URL en app.js."));
    return fetch(CATALYST_BASE_URL + "/server/oncoApi/crear", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ modulo: module, datos: data })
    }).then(function (resp) { return resp.json(); }).then(function (resp) {
      var detail = resp && Array.isArray(resp.data) ? resp.data[0] : null;
      if (!detail || detail.code !== "SUCCESS") throw new Error((detail && detail.message) || resp.error || "No se pudo guardar el registro.");
      return detail.details.id;
    });
  }
  function zUpdate(module, id, data) {
    if (MOCK) {
      var rec = (MOCK[module] || []).find(function (r) { return r.id === id; });
      if (rec) Object.assign(rec, data);
      guardarMock();
      return Promise.resolve(true);
    }
    if (!CATALYST_BASE_URL) return Promise.reject(new Error("Falta configurar CATALYST_BASE_URL en app.js."));
    // POST, no PUT: PUT dispara preflight siempre, sin importar el
    // content-type -- la funcion distingue crear/actualizar por la ruta,
    // no por el metodo HTTP.
    return fetch(CATALYST_BASE_URL + "/server/oncoApi/actualizar", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ modulo: module, id: id, datos: data })
    }).then(function (resp) { return resp.json(); }).then(function (resp) {
      var detail = resp && Array.isArray(resp.data) ? resp.data[0] : null;
      if (!detail || detail.code !== "SUCCESS") throw new Error((detail && detail.message) || resp.error || "No se pudo actualizar el registro.");
      return true;
    });
  }
  // "not_equal" NO es un operador valido en la Search Records API de Zoho
  // (solo admite equals/starts_with/in, segun el tipo de campo) -- el truco
  // de "not_equal a un valor imposible" que se uso al principio para traer
  // todo un modulo estaba mal y fallaba con INVALID_QUERY. Para "traer todo
  // sin filtro" se usa "in" con todos los valores posibles del picklist.
  function eqClause(field, value) { return "(" + field + ":equals:" + String(value).replace(/[()]/g, "") + ")"; }
  function andAll(clauses) { return clauses.join(""); }
  function inClause(field, values) { return "(" + field + ":in:" + values.join(",") + ")"; }

  // ===================================================================
  // Catalogos (picklists dinamicos desde Zoho, con respaldo local)
  // ===================================================================

  function extractPicklist(fieldsMeta, apiName) {
    if (!fieldsMeta) return null;
    var f = fieldsMeta.find(function (x) { return x.api_name === apiName; });
    if (!f || !Array.isArray(f.pick_list_values) || !f.pick_list_values.length) return null;
    return f.pick_list_values.map(function (p) { return p.display_value || p.actual_value; });
  }

  // Pasa por Catalyst (igual que zSearch), no por ZOHO.CRM.META directo --
  // asi Onco_Pacientes puede quedarse en Privado sin que esto falle.
  function loadPicklists() {
    if (MOCK || !CATALYST_BASE_URL) {
      app.picklists = Object.assign({}, FALLBACK_PICKLISTS);
      return Promise.resolve();
    }
    var urlPacientes = CATALYST_BASE_URL + "/server/oncoApi/campos?modulo=" + encodeURIComponent(MODULES.PACIENTES);
    // Ips_Oncologica_Actual vive en Onco_Casos, no en Onco_Pacientes -- hay
    // que pedir los metadatos de ese modulo por separado.
    var urlCasos = CATALYST_BASE_URL + "/server/oncoApi/campos?modulo=" + encodeURIComponent(MODULES.CASOS);
    return Promise.all([
      fetch(urlPacientes).then(function (resp) { return resp.json(); }),
      fetch(urlCasos).then(function (resp) { return resp.json(); }).catch(function () { return null; })
    ]).then(function (results) {
      var fields = results[0] && results[0].fields ? results[0].fields : null;
      var fieldsCasos = results[1] && results[1].fields ? results[1].fields : null;
      if (!fields) throw new Error((results[0] && results[0].message) || "respuesta inesperada");
      app.picklists = {
        Municipio: extractPicklist(fields, "Municipio") || FALLBACK_PICKLISTS.Municipio,
        Tipo_Cancer: extractPicklist(fields, "Tipo_Cancer") || FALLBACK_PICKLISTS.Tipo_Cancer,
        Asegurador_EPS: extractPicklist(fields, "Asegurador_EPS") || FALLBACK_PICKLISTS.Asegurador_EPS,
        Tipo_Documento: extractPicklist(fields, "Tipo_Documento") || FALLBACK_PICKLISTS.Tipo_Documento,
        Regimen_Afiliacion: extractPicklist(fields, "Regimen_Afiliacion") || FALLBACK_PICKLISTS.Regimen_Afiliacion,
        Grupo_Poblacional: extractPicklist(fields, "Grupo_Poblacional") || FALLBACK_PICKLISTS.Grupo_Poblacional,
        Factores_Criticidad: extractPicklist(fields, "Factores_Criticidad") || FALLBACK_PICKLISTS.Factores_Criticidad,
        Ips_Oncologica: (fieldsCasos && extractPicklist(fieldsCasos, "Ips_Oncologica_Actual")) || FALLBACK_PICKLISTS.Ips_Oncologica
      };
    })
      .catch(function (err) {
        app.picklists = Object.assign({}, FALLBACK_PICKLISTS);
        app.setupWarnings = app.setupWarnings || [];
        app.setupWarnings.push("No se pudieron leer los catálogos de " + MODULES.PACIENTES + " (" + ((err && err.message) || err) + "). Se usaron listas de respaldo.");
      });
  }

  function optionsHtml(values, selected) {
    return values.map(function (v) {
      return '<option value="' + escapeHtml(v) + '"' + (v === selected ? " selected" : "") + ">" + escapeHtml(v) + "</option>";
    }).join("");
  }

  // ===================================================================
  // Identidad del usuario (portal de Zoho CRM)
  // ===================================================================

  function tryAutoIdentify() {
    if (!window.ZOHO || !ZOHO.CRM || !ZOHO.CRM.CONFIG || typeof ZOHO.CRM.CONFIG.getCurrentUser !== "function") {
      return Promise.resolve(null);
    }
    return ZOHO.CRM.CONFIG.getCurrentUser()
      .then(function (data) {
        var u = data && (data.users ? data.users[0] : data);
        var email = u && (u.email || u.Email);
        return email || null;
      })
      .catch(function () { return null; });
  }

  function loadContactProfile(email) {
    return zSearchDirect(MODULES.CONTACTS, eqClause("Email", email)).then(function (rows) {
      var c = rows.find(function (r) { return r.Email === email; });
      if (!c || c.Activo_Onco === false || !c.Rol_Onco) return null;
      return {
        email: c.Email,
        nombre: ((c.First_Name || "") + " " + (c.Last_Name || "")).trim() || c.Email,
        telefono: c.Mobile || c.Phone || "",
        rol: c.Rol_Onco,
        // El nombre de API real quedo "Instituci_n_Onco" (Zoho reemplazo la
        // "o" con tilde del label "Institución Onco" por "_" al generarlo
        // automaticamente) -- no es un typo, confirmado contra el Contacto real.
        institucion: c.Instituci_n_Onco || ""
      };
    });
  }

  function findManualOverride() {
    try {
      var raw = sessionStorage.getItem(IDENTIFY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function setManualOverride(email) { sessionStorage.setItem(IDENTIFY_KEY, JSON.stringify({ email: email })); }

  function identifyUser() {
    var manual = findManualOverride();
    var emailPromise = manual ? Promise.resolve(manual.email) : tryAutoIdentify();

    return emailPromise.then(function (email) {
      if (!email) return showIdentifyScreen();
      return loadContactProfile(email).then(function (profile) {
        if (!profile) return showIdentifyScreen("No encontramos un usuario activo con rol asignado para \"" + email + "\". Verifica el Contacto en Zoho CRM (campos Rol_Onco / Activo_Onco), o elige otro correo abajo.");
        app.currentUser = profile;
        return true;
      });
    });
  }

  function showIdentifyScreen(errorMsg) {
    var todosLosRoles = [ROLES.GESTOR_ESE, ROLES.LIDER_EPS, ROLES.NAVEGADOR_IPS, ROLES.ADMIN];
    return zSearchDirect(MODULES.CONTACTS, inClause("Rol_Onco", todosLosRoles)).then(function (rows) {
      var candidatos = rows.filter(function (r) { return r.Rol_Onco && r.Activo_Onco !== false && r.Email; });
      $("loading-screen").hidden = true;
      var select = $("identify-select");
      select.innerHTML = candidatos.map(function (c) {
        var nombre = ((c.First_Name || "") + " " + (c.Last_Name || "")).trim() || c.Email;
        return '<option value="' + escapeHtml(c.Email) + '">' + escapeHtml(nombre) + " — " + escapeHtml(ROLE_LABELS[c.Rol_Onco] || c.Rol_Onco) + "</option>";
      }).join("");
      if (errorMsg) {
        $("identify-error").hidden = false;
        $("identify-error").textContent = errorMsg;
      }
      $("identify-screen").hidden = false;
      return new Promise(function (resolve) {
        $("identify-continue-btn").onclick = function () {
          var email = select.value;
          if (!email) return;
          setManualOverride(email);
          $("identify-screen").hidden = true;
          $("loading-screen").hidden = false;
          loadContactProfile(email).then(function (profile) {
            app.currentUser = profile;
            resolve(true);
          });
        };
      });
    });
  }

  // Perfiles fijos para probar la app fuera del Client Portal de Zoho (ej.
  // abriendo widget.html con un servidor local). Las instituciones elegidas
  // coinciden con catalogos reales que ya tienen casos de prueba cargados en
  // Zoho, para que "Mis casos" no se vea vacio al entrar. Esto NO reemplaza
  // la identificacion real del portal -- solo se usa cuando la app detecta
  // que no esta corriendo dentro de un iframe de Zoho (ver boot al final del
  // archivo).
  var PERFILES_DEMO_LOCAL = [
    { email: "demo.gestor@local.test", nombre: "Demo Gestor E.S.E.", rol: ROLES.GESTOR_ESE, institucion: "E.S.E. Pasto" },
    { email: "demo.lider@local.test", nombre: "Demo Líder Cohorte", rol: ROLES.LIDER_EPS, institucion: "EMSSANAR" },
    { email: "demo.navegador@local.test", nombre: "Demo Navegador IPS", rol: ROLES.NAVEGADOR_IPS, institucion: "Instituto Cancerológico de Nariño (ICN)" },
    { email: "demo.admin@local.test", nombre: "Demo Administrador", rol: ROLES.ADMIN, institucion: "" }
  ];
  var LOCAL_ROLE_KEY = "onco_modo_local_rol";

  // Unico punto de entrada para "convertirse" en uno de los perfiles de
  // demo: lo usan tanto la pantalla completa de seleccion (primera carga)
  // como el desplegable rapido del topbar (ver wireRoleSwitchDropdown). Se
  // recuerda la eleccion en sessionStorage y se recarga la pagina -- mas
  // simple y seguro que re-ejecutar bootAfterIdentify() a mano (esa funcion
  // engancha listeners que no estan pensados para correr dos veces).
  function entrarComoPerfilLocal(idx) {
    sessionStorage.setItem(LOCAL_ROLE_KEY, String(idx));
    location.reload();
  }

  function iniciarModoLocal() {
    var stashed = sessionStorage.getItem(LOCAL_ROLE_KEY);
    var idx = stashed !== null ? Number(stashed) : null;
    if (idx !== null && PERFILES_DEMO_LOCAL[idx]) {
      var p = PERFILES_DEMO_LOCAL[idx];
      app.currentUser = { email: p.email, nombre: p.nombre, telefono: "", rol: p.rol, institucion: p.institucion };
      app._modoLocal = true;
      if (!MOCK) {
        MOCK = cargarMockGuardado();
        if (!MOCK) { MOCK = construirMockData(); guardarMock(); }
      }
      bootAfterIdentify();
      return;
    }
    $("loading-screen").hidden = true;
    $("identify-explain").textContent = "Estás corriendo esta app fuera del Client Portal de Zoho (modo demo local, 100% fuera de línea). " +
      "Elige con qué rol de demo quieres entrar -- los datos son ficticios, generados en memoria en tu navegador, no se conecta a Zoho ni a Catalyst.";
    var select = $("identify-select");
    select.innerHTML = PERFILES_DEMO_LOCAL.map(function (p, i) {
      return '<option value="' + i + '">' + escapeHtml(p.nombre) + " — " + escapeHtml(ROLE_LABELS[p.rol] || p.rol) + "</option>";
    }).join("");
    $("identify-screen").hidden = false;
    $("identify-continue-btn").onclick = function () { entrarComoPerfilLocal(Number(select.value)); };
  }

  // ===================================================================
  // Modo local: desplegable rapido para cambiar de rol desde el topbar
  // (sin pasar por la pantalla completa de seleccion). Mismo patron que el
  // dropdown de notificaciones (toggle / close / click-fuera-para-cerrar).
  // ===================================================================

  function toggleRoleSwitchDropdown() {
    var dropdown = $("role-switch-dropdown");
    if (!dropdown) return;
    if (!dropdown.hidden) { closeRoleSwitchDropdown(); return; }
    renderRoleSwitchDropdown();
    dropdown.hidden = false;
    setTimeout(function () { document.addEventListener("click", onDocClickCloseRoleSwitch); }, 0);
  }
  function closeRoleSwitchDropdown() {
    var dropdown = $("role-switch-dropdown");
    if (dropdown) dropdown.hidden = true;
    document.removeEventListener("click", onDocClickCloseRoleSwitch);
  }
  function onDocClickCloseRoleSwitch(evt) {
    var dropdown = $("role-switch-dropdown");
    var btn = $("topbar-user-btn");
    if (!dropdown || dropdown.hidden) return;
    if (dropdown.contains(evt.target) || (btn && btn.contains(evt.target))) return;
    closeRoleSwitchDropdown();
  }
  function renderRoleSwitchDropdown() {
    var dropdown = $("role-switch-dropdown");
    dropdown.innerHTML = '<div class="notif-dropdown-header">Cambiar de rol (demo local)</div>' +
      PERFILES_DEMO_LOCAL.map(function (p, i) {
        var activo = app.currentUser && app.currentUser.email === p.email;
        return '<div class="case-card" data-idx="' + i + '" style="cursor:pointer;margin-bottom:6px;' + (activo ? "border-color:var(--brand-500);" : "") + '">' +
          '<div style="font-weight:600;font-size:13px;">' + (activo ? "✓ " : "") + escapeHtml(p.nombre) + "</div>" +
          '<div style="font-size:11.5px;color:var(--ink-2);">' + escapeHtml(ROLE_LABELS[p.rol] || p.rol) + (p.institucion ? " · " + escapeHtml(p.institucion) : "") + "</div>" +
          "</div>";
      }).join("") +
      '<div style="height:1px;background:var(--grid);margin:8px 0;"></div>' +
      '<div id="role-switch-reset" style="cursor:pointer;font-size:12px;color:var(--ink-2);text-align:center;padding:6px;">Reiniciar datos del demo</div>';
    Array.prototype.forEach.call(dropdown.querySelectorAll("[data-idx]"), function (row) {
      row.addEventListener("click", function () { entrarComoPerfilLocal(Number(row.dataset.idx)); });
    });
    $("role-switch-reset").addEventListener("click", function () {
      if (confirm("¿Borrar todos los casos/pacientes del demo local y empezar de cero?")) reiniciarDatosDemo();
    });
  }

  // ===================================================================
  // Carga de datos
  // ===================================================================

  function institucionFiltroField() {
    var rol = app.currentUser.rol;
    if (rol === ROLES.GESTOR_ESE) return "Institucion_Reportante";
    if (rol === ROLES.LIDER_EPS) return "Eps_Actual";
    if (rol === ROLES.NAVEGADOR_IPS) return "Ips_Oncologica_Actual";
    return null; // Administrador: sin filtro
  }

  function loadCasos() {
    var field = institucionFiltroField();
    if (field && !app.currentUser.institucion) {
      var errInst = new Error("Tu usuario (" + app.currentUser.email + ") tiene el rol " + app.currentUser.rol +
        " pero el campo \"Institución Onco\" (Instituci_n_Onco) de tu Contacto está vacío. Complétalo en Zoho CRM con el nombre de tu institución y vuelve a entrar.");
      errInst.ownMessage = true;
      return Promise.reject(errInst);
    }
    // Administrador (sin institucion que filtre): no hay un truco "traer
    // todo sin criterio" para onco_buscar, asi que se usa "in" con todos
    // los valores posibles del picklist -- equivalente a "sin filtro".
    var todosLosEstados = Object.keys(EST).map(function (k) { return EST[k]; });
    var peticion = field ? zSearch(MODULES.CASOS, eqClause(field, app.currentUser.institucion)) : zSearch(MODULES.CASOS, inClause("Estado_Actual", todosLosEstados));
    return peticion.then(function (rows) {
      app.casos = rows.sort(function (a, b) { return new Date(b.Ultima_Actualizacion || b.Fecha_de_Reporte) - new Date(a.Ultima_Actualizacion || a.Fecha_de_Reporte); });
      return rellenarMunicipioDesdePaciente(app.casos).then(function () { return app.casos; });
    });
  }

  // Onco_Casos.Municipio es un campo denormalizado (copia de
  // Onco_Pacientes.Municipio al reportar el caso) -- si ese campo todavia
  // no existe en Zoho, o un caso viejo se creo antes de que existiera,
  // c.Municipio llega vacio. En vez de dejarlo en blanco en toda la app,
  // se completa aqui mismo con el municipio del paciente vinculado (un
  // solo lugar, asi cualquier vista que lea c.Municipio ya lo recibe
  // resuelto). Limitado a 300 pacientes por carga para no disparar
  // demasiadas consultas en paralelo si son muchos casos sin ese dato.
  function rellenarMunicipioDesdePaciente(casos) {
    var faltantes = {};
    casos.forEach(function (c) { if (!c.Municipio) { var pid = lookupId(c.Paciente); if (pid) faltantes[pid] = true; } });
    var ids = Object.keys(faltantes).slice(0, 300);
    if (!ids.length) return Promise.resolve();
    return Promise.all(ids.map(function (id) { return loadPaciente(id); })).then(function (pacientes) {
      var municipioPorId = {};
      pacientes.forEach(function (p) { if (p && p.Municipio) municipioPorId[p.id] = p.Municipio; });
      casos.forEach(function (c) {
        if (c.Municipio) return;
        var pid = lookupId(c.Paciente);
        if (pid && municipioPorId[pid]) c.Municipio = municipioPorId[pid];
      });
    });
  }

  function loadAlertasBandeja() {
    if (!FEATURES.alertas) { app.alertas = []; return Promise.resolve(app.alertas); }
    var rol = app.currentUser.rol;
    var peticion;
    if (rol === ROLES.ADMIN) {
      peticion = zSearch(MODULES.ALERTAS, inClause("Estado", ["Pendiente", "Atendida"]));
    } else if (!app.currentUser.institucion) {
      // Institucion_Onco vacio en el Contacto: sin institucion no hay forma
      // valida de armar este criterio, se trata como "sin alertas" en vez
      // de mandar una consulta con un valor vacio (Zoho la rechaza).
      app.alertas = [];
      return Promise.resolve(app.alertas);
    } else {
      peticion = zSearch(MODULES.ALERTAS, andAll([eqClause("Destinatario_Rol", rol), eqClause("Destinatario_Institucion", app.currentUser.institucion)]));
    }
    return peticion.then(function (rows) {
      app.alertas = rows.sort(function (a, b) { return new Date(b.Fecha_Creacion) - new Date(a.Fecha_Creacion); });
      return app.alertas;
    });
  }

  function pendingAlertCount() {
    return app.alertas.filter(function (a) { return a.Estado !== "Atendida"; }).length;
  }

  // "Notificaciones" (antes solo "Alertas") ahora tambien avisa de cambios
  // recientes de estado en los casos que ya ve este rol/institucion (ej.
  // "el caso que reporte paso a esperando autorizacion") -- no hay push
  // real (el widget no tiene backend con websockets/webhooks), es una
  // marca de "visto hasta cuando" guardada en localStorage: todo caso con
  // Ultima_Actualizacion mas reciente que esa marca cuenta como no visto.
  var NOTIF_SEEN_KEY = "onco_notif_last_seen";
  function getLastNotifSeenAt() {
    try { return Number(localStorage.getItem(NOTIF_SEEN_KEY)) || 0; } catch (e) { return 0; }
  }
  function setLastNotifSeenAt(ts) {
    try { localStorage.setItem(NOTIF_SEEN_KEY, String(ts)); } catch (e) {}
  }
  function casosConCambiosRecientes() {
    var desde = Date.now() - 14 * 86400000; // ventana de 14 dias para la lista completa
    return app.casos.filter(function (c) { return c.Ultima_Actualizacion && new Date(c.Ultima_Actualizacion).getTime() >= desde; })
      .sort(function (a, b) { return new Date(b.Ultima_Actualizacion) - new Date(a.Ultima_Actualizacion); });
  }
  function pendingCaseChangesCount() {
    var vistoHasta = getLastNotifSeenAt();
    return app.casos.filter(function (c) { return c.Ultima_Actualizacion && new Date(c.Ultima_Actualizacion).getTime() > vistoHasta; }).length;
  }
  function pendingNotifCount() { return pendingAlertCount() + pendingCaseChangesCount(); }

  function findCaso(id) { return app.casos.find(function (c) { return c.id === id; }); }
  // Los campos de tipo Lookup vuelven de ZOHO.CRM.API como {id, name}, no
  // como el id crudo que se envio al insertar/actualizar.
  function lookupId(v) { return v && typeof v === "object" ? v.id : v; }

  function loadPaciente(id) {
    if (app.pacientesById[id]) return Promise.resolve(app.pacientesById[id]);
    return zSearch(MODULES.PACIENTES, "(id:equals:" + id + ")").then(function (rows) {
      var p = rows[0] || null;
      if (p) app.pacientesById[id] = p;
      return p;
    });
  }

  function loadEventosDeCaso(casoId) {
    if (!FEATURES.eventos) return Promise.resolve([]);
    return zSearch(MODULES.EVENTOS, eqClause("Caso", casoId)).then(function (rows) {
      return rows.sort(function (a, b) { return new Date(a.Fecha_Evento || a.Created_Time) - new Date(b.Fecha_Evento || b.Created_Time); });
    });
  }

  function loadAlertasDeCaso(casoId) {
    if (!FEATURES.alertas) return Promise.resolve([]);
    return zSearch(MODULES.ALERTAS, eqClause("Caso", casoId)).then(function (rows) {
      return rows.sort(function (a, b) { return new Date(b.Fecha_Creacion) - new Date(a.Fecha_Creacion); });
    });
  }

  // ===================================================================
  // Escritura: eventos + transiciones de estado
  // ===================================================================

  function registrarEvento(casoId, tipoEvento, campos) {
    if (!FEATURES.eventos) return Promise.resolve(null);
    var base = {
      Caso: { id: casoId },
      Tipo_Evento: tipoEvento,
      // Fecha (solo dia), no Fecha y hora -- ver dateInputToEventDateTime.
      Fecha_Evento: campos.Fecha_Evento || toZohoDate(new Date()),
      Registrado_Por: app.currentUser.email,
      Rol_Registro: app.currentUser.rol,
      Institucion_Registro: app.currentUser.institucion
    };
    delete campos.Fecha_Evento;
    return zInsert(MODULES.EVENTOS, Object.assign(base, campos));
  }

  function actualizarCaso(casoId, campos) {
    return zUpdate(MODULES.CASOS, casoId, Object.assign({}, campos, { Ultima_Actualizacion: nowIso() }));
  }

  // Combina insertar el evento + actualizar el caso, y refresca la vista de
  // detalle. Es el punto unico por el que pasa cada transicion de la
  // maquina de estados (ver README seccion 6).
  function ejecutarTransicion(caso, tipoEvento, eventoCampos, casoCampos) {
    setBusy(true);
    return registrarEvento(caso.id, tipoEvento, eventoCampos)
      .then(function () { return actualizarCaso(caso.id, casoCampos); })
      .then(function () {
        toast("Guardado.");
        return loadCasos();
      })
      .then(function () { renderDetalleCaso(caso.id); })
      .catch(function (err) { toast(err.message || "No se pudo guardar."); })
      .then(function () { setBusy(false); });
  }

  function setBusy(v) { app._busy = v; }

  // ===================================================================
  // Deduplicacion de paciente + reporte inicial de caso
  // ===================================================================

  function buscarPacientePorDocumento(numeroDocumento) {
    return zSearch(MODULES.PACIENTES, eqClause("Numero_Documento", numeroDocumento)).then(function (rows) {
      return rows[0] || null;
    });
  }

  // Evita reportar un caso duplicado para un paciente que ya tiene uno
  // activo (ver README seccion 7, "Deduplicacion de pacientes").
  function buscarCasoActivoPorPaciente(pacienteId) {
    return zSearch(MODULES.CASOS, eqClause("Paciente", pacienteId)).then(function (rows) {
      return rows.find(function (c) { return TERMINALES.indexOf(c.Estado_Actual) === -1; }) || null;
    });
  }

  function crearOReusarPaciente(datos) {
    return buscarPacientePorDocumento(datos.Numero_Documento).then(function (existente) {
      if (existente) return existente.id;
      // El campo primario del modulo quedo con su nombre de API por
      // defecto "Name" (no "Nombre_Completo" como se pidio al crearlo) --
      // confirmado en vivo con el error MANDATORY_NOT_FOUND / api_name:"Name".
      var payload = Object.assign({ Name: (datos.Nombres + " " + datos.Apellidos).trim(), Departamento: "Nariño" }, datos);
      return zInsert(MODULES.PACIENTES, payload);
    });
  }

  function siguientePasoTexto(estado) {
    var mapa = {};
    mapa[EST.CASO_REPORTADO] = "Esperando que se ordene la prueba confirmatoria";
    mapa[EST.SIN_PRUEBA_ORDENADA] = "Confirmar si ya se ordenó la prueba confirmatoria";
    mapa[EST.PRUEBA_AUTORIZACION_PENDIENTE] = "Esperando autorización de la EPS para la prueba confirmatoria";
    mapa[EST.PRUEBA_AUTORIZADA] = "Programar fecha de prueba confirmatoria";
    mapa[EST.PRUEBA_PROGRAMADA] = "Confirmar contacto con la paciente antes de la cita";
    mapa[EST.PRUEBA_CONTACTO_CONFIRMADO] = "Registrar si la prueba se realizó y su resultado";
    mapa[EST.PRUEBA_REALIZADA] = "Registrar siguiente paso clínico";
    mapa[EST.SIN_ESPECIALISTA_REQUERIDO] = "Confirmar seguimiento sin especialista o cerrar el caso";
    mapa[EST.VALORACION_AUTORIZACION_PENDIENTE] = "Esperando autorización de la EPS para especialista";
    mapa[EST.VALORACION_AUTORIZADA] = "Programar cita con especialista";
    mapa[EST.VALORACION_PROGRAMADA] = "Confirmar contacto con la paciente antes de la cita";
    mapa[EST.VALORACION_CONTACTO_CONFIRMADO] = "Registrar si la cita con especialista se realizó";
    mapa[EST.CITA_ESPECIALISTA_REALIZADA] = "Confirmar malignidad con resultado del patólogo";
    mapa[EST.MALIGNIDAD_CONFIRMADA] = "Ordenar tratamiento";
    mapa[EST.TRATAMIENTO_ORDENADO] = "Registrar fecha de inicio de tratamiento";
    mapa[EST.TRATAMIENTO_INICIADO] = "Seguimiento en tratamiento";
    mapa[EST.RECAIDA] = "Ordenar nuevo ciclo de tratamiento";
    mapa[EST.CASO_CERRADO_NO_ONCOLOGICO] = "Caso cerrado";
    mapa[EST.CASO_FALLECIDO] = "Caso cerrado";
    mapa[EST.CASO_CERRADO] = "Caso cerrado";
    return mapa[estado] || "";
  }

  function submitReporteCaso(form) {
    var pacienteDatos = {
      Nombres: form.nombres, Apellidos: form.apellidos, Tipo_Documento: form.tipoDocumento,
      Numero_Documento: form.numeroDocumento, Edad: Number(form.edad) || null, Genero: form.genero,
      Regimen_Afiliacion: form.regimenAfiliacion, Asegurador_EPS: form.aseguradorEps, Municipio: form.municipio,
      Ips_Atencion_Actual: form.ipsAtencionActual, Telefono_1: form.telefono1, Telefono_2: form.telefono2,
      Correo: form.correo, Direccion: form.direccion, Recomendaciones_Comunicacion: form.recomendaciones,
      Tipo_Cancer: form.tipoCancer, Factores_Criticidad: form.factoresCriticidad || [], Grupo_Poblacional: form.grupoPoblacional || [],
      Acudiente_Nombre: form.acudienteNombre, Acudiente_Telefono: form.acudienteTelefono,
      Acudiente_Direccion: form.acudienteDireccion, Acudiente_Parentesco: form.acudienteParentesco
    };
    setBusy(true);
    return crearOReusarPaciente(pacienteDatos).then(function (pacienteId) {
      return buscarCasoActivoPorPaciente(pacienteId).then(function (existente) {
        if (existente) {
          var err = new Error("Este paciente ya tiene un caso activo (" + (existente.Name || existente.Numero_Caso) + ", " + (EST_LABELS[existente.Estado_Actual] || existente.Estado_Actual) + "). Ábrelo en vez de crear uno duplicado.");
          err.casoExistenteId = existente.id;
          throw err;
        }
        return pacienteId;
      });
    }).then(function (pacienteId) {
      var estadoInicial = form.pruebaOrdenada === "Si" ? EST.PRUEBA_AUTORIZACION_PENDIENTE : EST.SIN_PRUEBA_ORDENADA;
      var casoPayload = {
        Paciente: { id: pacienteId },
        Estado_Actual: estadoInicial,
        Institucion_Reportante: app.currentUser.institucion,
        Reportado_Por: app.currentUser.email,
        // En la organizacion de Zoho actual este campo quedo tipo "Fecha y
        // hora" (DateTime), no "Fecha" -- confirmado en vivo con
        // INVALID_DATA/expected_data_type:"datetime" al mandar solo la
        // fecha. nowIso() da el formato datetime con offset de zona horaria
        // que esta organizacion espera.
        Fecha_de_Reporte: nowIso(),
        Eps_Actual: form.aseguradorEps,
        Municipio: form.municipio,
        Siguiente_Paso: siguientePasoTexto(estadoInicial)
      };
      return zInsert(MODULES.CASOS, casoPayload).then(function (casoId) {
        return registrarEvento(casoId, EVT.REPORTE_INICIAL, {
          Comentario: "Diligenciado por " + form.diligenciaNombre + " (tel. " + form.diligenciaTelefono + ")."
        }).then(function () {
          // El buscador de Zoho puede tardar unos segundos en indexar un
          // registro recien creado -- una busqueda inmediata (loadCasos,
          // loadPaciente) podria no encontrarlo todavia aunque ya exista.
          // Se cachea el paciente localmente y se devuelve el caso armado
          // a mano para que la app lo muestre al instante sin esperar al
          // indice; loadCasos() en segundo plano lo reconcilia despues.
          app.pacientesById[pacienteId] = Object.assign({ id: pacienteId, Name: (form.nombres + " " + form.apellidos).trim() }, pacienteDatos);
          return { id: casoId, payload: casoPayload };
        });
      });
    });
  }

  // ===================================================================
  // Alertas (barreras de acceso)
  // ===================================================================

  function resolverDestinatarioBarrera(barreraDef, caso, extra) {
    if (barreraDef.needs === "ips") {
      var ips = extra.ips || caso.Ips_Oncologica_Actual || "";
      return { rol: ROLES.NAVEGADOR_IPS, institucion: ips, ipsRelacionada: ips, epsRelacionada: "" };
    }
    if (barreraDef.needs === "eps") {
      return { rol: ROLES.LIDER_EPS, institucion: caso.Eps_Actual || "", ipsRelacionada: "", epsRelacionada: caso.Eps_Actual || "" };
    }
    if (barreraDef.needs === "auto_gestor") {
      return { rol: ROLES.GESTOR_ESE, institucion: caso.Institucion_Reportante || "", ipsRelacionada: "", epsRelacionada: "" };
    }
    return { rol: app.currentUser.rol, institucion: app.currentUser.institucion, ipsRelacionada: "", epsRelacionada: "" };
  }

  function submitReportarBarrera(caso, form) {
    var def = BARRERAS.find(function (b) { return b.value === form.tipoBarrera; });
    if (!def) return Promise.reject(new Error("Selecciona el tipo de barrera."));
    var destino = resolverDestinatarioBarrera(def, caso, { ips: form.ips });
    setBusy(true);
    return zInsert(MODULES.ALERTAS, {
      Caso: { id: caso.id },
      Tipo_Barrera: def.value,
      Disparada_Por: app.currentUser.email,
      Institucion_Disparada_Por: app.currentUser.institucion,
      Destinatario_Rol: destino.rol,
      Destinatario_Institucion: destino.institucion,
      Ips_Relacionada: destino.ipsRelacionada,
      Eps_Relacionada: destino.epsRelacionada,
      Detalle: form.detalle || "",
      Estado: "Pendiente",
      Fecha_Creacion: nowIso()
    }).then(function () {
      toast("Alerta enviada a " + (ROLE_LABELS[destino.rol] || destino.rol) + (destino.institucion ? " (" + destino.institucion + ")" : "") + ".");
      closeModal();
      return loadAlertasBandeja();
    }).catch(function (err) { toast(err.message || "No se pudo enviar la alerta."); })
      .then(function () { setBusy(false); });
  }

  function marcarAlertaAtendida(alertaId, nota) {
    setBusy(true);
    return zUpdate(MODULES.ALERTAS, alertaId, {
      Estado: "Atendida", Fecha_Atencion: nowIso(), Atendida_Por: app.currentUser.email, Nota_Atencion: nota || ""
    }).then(function () {
      toast("Alerta marcada como atendida.");
      return loadAlertasBandeja();
    }).then(function () { renderRoute(); })
      .catch(function (err) { toast(err.message || "No se pudo actualizar la alerta."); })
      .then(function () { setBusy(false); });
  }

  // ===================================================================
  // Shell: sidebar / topbar / bottom nav
  // ===================================================================

  function navItemsForRole() {
    var rol = app.currentUser.rol;
    var items;
    if (rol === ROLES.GESTOR_ESE) items = [
      { route: "gestor_mis_casos", label: "Mis casos", ic: "file" },
      { route: "pacientes", label: "Pacientes", ic: "users" },
      { route: "alertas", label: "Alertas", ic: "bell", badge: true }
    ];
    else if (rol === ROLES.LIDER_EPS) items = [
      { route: "lider_bandeja", label: "Bandeja pendiente", ic: "inbox" },
      { route: "lider_historial", label: "Historial de casos", ic: "file" },
      { route: "pacientes", label: "Pacientes", ic: "users" },
      { route: "alertas", label: "Alertas", ic: "bell", badge: true }
    ];
    else if (rol === ROLES.NAVEGADOR_IPS) items = [
      { route: "nav_agenda", label: "Agenda pendiente", ic: "calendar" },
      { route: "pacientes", label: "Pacientes", ic: "users" },
      { route: "alertas", label: "Alertas", ic: "bell", badge: true }
    ];
    else items = [
      { route: "admin_dashboard", label: "Dashboard", ic: "bars" }
    ];
    // El modulo Onco_Alertas todavia no existe en el CRM (ver FEATURES al
    // inicio del archivo): se oculta la pestana "Alertas" hasta que se
    // cree. El bell de notificaciones del topbar es independiente de esto
    // (ver toggleNotifDropdown) -- sigue mostrando cambios de caso
    // aunque Onco_Alertas no exista.
    if (!FEATURES.alertas) items = items.filter(function (it) { return it.route !== "alertas"; });
    return items;
  }

  function renderShellChrome() {
    var items = navItemsForRole();
    // El badge del sidebar/bottom-nav de "Alertas" solo cuenta barreras de
    // acceso pendientes (Onco_Alertas) -- el bell de "Notificaciones" del
    // topbar es un contador aparte que ademas suma cambios de estado en
    // los casos (ver pendingNotifCount).
    var alertBadgeCount = pendingAlertCount();

    els.sidebar.innerHTML = '<div class="sidebar-group-label">Ruta oncológica</div>' + items.map(function (it) {
      return '<button class="sidebar-item" data-route="' + it.route + '">' + icon(it.ic) +
        "<span>" + it.label + "</span>" +
        (it.badge && alertBadgeCount ? '<span class="count-badge">' + alertBadgeCount + "</span>" : "") +
        "</button>";
    }).join("");
    Array.prototype.forEach.call(els.sidebar.querySelectorAll(".sidebar-item"), function (btn) {
      btn.addEventListener("click", function () { navigate(btn.dataset.route); });
    });

    els.bottomNav.innerHTML = items.map(function (it) {
      return '<button class="bottom-nav-item" data-route="' + it.route + '">' +
        (it.badge && alertBadgeCount ? '<span class="bottom-nav-dot"></span>' : "") +
        icon(it.ic) + "<span>" + it.label + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(els.bottomNav.querySelectorAll(".bottom-nav-item"), function (btn) {
      btn.addEventListener("click", function () { navigate(btn.dataset.route); });
    });

    $("user-avatar").textContent = initialsOf(app.currentUser.nombre);
    $("user-name").textContent = app.currentUser.nombre;
    $("user-role-label").textContent = (ROLE_LABELS[app.currentUser.rol] || app.currentUser.rol) +
      (app.currentUser.institucion ? " · " + app.currentUser.institucion : "");

    // En modo local (fuera del Client Portal) el boton de usuario abre un
    // desplegable para cambiar de rol de demo al instante, en vez de solo
    // mostrar informacion.
    if (app._modoLocal) {
      $("user-role-label").textContent += " · demo local";
      var userBtn = $("topbar-user-btn");
      userBtn.title = "Cambiar de rol de demo";
      userBtn.style.cursor = "pointer";
      userBtn.onclick = function (evt) { evt.stopPropagation(); toggleRoleSwitchDropdown(); };
    }

    // El Administrador ya tiene su propio dashboard con pestanas de
    // "Riesgo y alertas" y "Actividad reciente" -- el buscador global y la
    // campana de notificaciones (pensados para los roles operativos que
    // navegan por casos sueltos) quedan de mas para ese rol.
    var esAdmin = app.currentUser.rol === ROLES.ADMIN;
    $("topbar-search-wrap").hidden = esAdmin;
    $("bell-wrap").hidden = esAdmin;
    $("topbar-divider-1").hidden = esAdmin;
    if (!esAdmin) {
      var notifBadgeCount = pendingNotifCount();
      $("bell-dot").hidden = notifBadgeCount === 0;
      $("bell-dot").textContent = notifBadgeCount > 99 ? "99+" : String(notifBadgeCount);
    }

    highlightActiveNav();
  }

  function highlightActiveNav() {
    var current = app.route.name;
    Array.prototype.forEach.call(document.querySelectorAll(".sidebar-item, .bottom-nav-item"), function (btn) {
      btn.classList.toggle("active", btn.dataset.route === current);
    });
  }

  // ===================================================================
  // Router
  // ===================================================================

  var ROUTES = {};

  function navigate(name, params) {
    app.route = { name: name, params: params || {} };
    if (name !== "detalle_caso") app.lastListRoute = { name: name, params: params || {} };
    highlightActiveNav();
    renderRoute();
  }

  function renderRoute() {
    var r = ROUTES[app.route.name];
    if (r) r(app.route.params);
  }

  function defaultRouteForRole() {
    var rol = app.currentUser.rol;
    if (rol === ROLES.GESTOR_ESE) return "gestor_mis_casos";
    if (rol === ROLES.LIDER_EPS) return "lider_bandeja";
    if (rol === ROLES.NAVEGADOR_IPS) return "nav_agenda";
    return "admin_dashboard";
  }

  // ===================================================================
  // Componentes de vista reutilizables
  // ===================================================================

  function pillForEstado(estado) {
    if (estado === EST.CASO_FALLECIDO) return { cls: "muted", text: "Fallecido" };
    if (estado === EST.CASO_CERRADO || estado === EST.CASO_CERRADO_NO_ONCOLOGICO) return { cls: "muted", text: "Cerrado" };
    if (estado === EST.TRATAMIENTO_INICIADO) return { cls: "good", text: "En tratamiento" };
    if (estado === EST.RECAIDA || estado === EST.SIN_PRUEBA_ORDENADA || estado === EST.SIN_ESPECIALISTA_REQUERIDO) return { cls: "crit", text: EST_LABELS[estado] };
    if (estado.indexOf("Autorizacion_Pendiente") !== -1) return { cls: "warn", text: EST_LABELS[estado] };
    return { cls: "brand", text: EST_LABELS[estado] || estado };
  }
  function pillHtml(p) { return '<span class="pill ' + p.cls + '"><span class="pill-dot"></span>' + escapeHtml(p.text) + "</span>"; }

  function pageHeader(title, subtitle) {
    return '<div class="page-header"><div class="title">' + escapeHtml(title) + '</div>' +
      (subtitle ? '<div class="subtitle">' + escapeHtml(subtitle) + "</div>" : "") + "</div>";
  }

  function backHeader(label) {
    return '<div class="page-header-back" id="back-btn">' + icon("chevronLeft") + "<span>" + escapeHtml(label) + "</span></div>";
  }

  function fieldHtml(opts) {
    // opts: {id, label, type, value, required, options(optional array), hint}
    var id = opts.id, req = opts.required ? " required" : "";
    var inner;
    if (opts.type === "select") {
      inner = '<select id="' + id + '"' + req + ">" + (opts.placeholder ? '<option value="">' + escapeHtml(opts.placeholder) + "</option>" : "") + optionsHtml(opts.options || [], opts.value) + "</select>";
    } else if (opts.type === "checkboxes") {
      var selected = opts.value || [];
      inner = '<div class="checkbox-group" id="' + id + '">' + (opts.options || []).map(function (o) {
        var checked = selected.indexOf(o) !== -1 ? " checked" : "";
        return '<label class="checkbox-option"><input type="checkbox" value="' + escapeHtml(o) + '"' + checked + " />" + escapeHtml(o) + "</label>";
      }).join("") + "</div>";
    } else if (opts.type === "textarea") {
      inner = '<textarea id="' + id + '" rows="' + (opts.rows || 3) + '" placeholder="' + escapeHtml(opts.placeholder || "") + '"' + req + ">" + escapeHtml(opts.value || "") + "</textarea>";
    } else {
      var extraAttrs = opts.type === "tel" ? ' inputmode="numeric" pattern="[0-9]*"' : "";
      inner = '<input type="' + (opts.type || "text") + '" id="' + id + '" value="' + escapeHtml(opts.value || "") + '" placeholder="' + escapeHtml(opts.placeholder || "") + '"' + req + extraAttrs + " />";
    }
    return '<div class="field">' + (opts.label ? "<label for=\"" + id + "\">" + escapeHtml(opts.label) + "</label>" : "") + inner +
      (opts.hint ? '<div class="field-hint">' + escapeHtml(opts.hint) + "</div>" : "") + "</div>";
  }

  function val(id) { var el = $(id); return el ? el.value.trim() : ""; }
  function checkboxVals(id) {
    var container = $(id);
    if (!container) return [];
    return Array.prototype.slice.call(container.querySelectorAll('input[type="checkbox"]:checked')).map(function (el) { return el.value; });
  }
  // Onco_Eventos.Fecha_Evento es un campo Fecha y hora en Zoho; los
  // <input type="date"> del formulario solo dan "YYYY-MM-DD", asi que hay
  // que completarlos a datetime antes de enviarlos. Se ancla a mediodia
  // local para que el huso horario nunca lo recorra al dia anterior.
  function dateInputToEventDateTime(id) {
    // Pese al nombre, esto ya NO arma un datetime: Onco_Tareas.Fecha_Evento
    // quedo tipo "Fecha" (solo dia), no "Fecha y hora" -- confirmado en vivo
    // con INVALID_DATA/expected_data_type:"date". Un <input type="date">
    // ya da "YYYY-MM-DD" tal cual lo necesita Zoho, sin conversion.
    return val(id);
  }

  // ===================================================================
  // Vista: Reportar caso (Gestor ESE) — formulario en pasos
  // ===================================================================

  var reporteWizard = { step: 0, data: {} };
  var REPORTE_STEPS = ["Quien reporta", "Datos del paciente", "Contacto y acudiente", "Detalles adicionales", "Revisión y envío"];

  // Guarda el progreso del formulario en sessionStorage para que un
  // congelamiento/recarga del widget no borre lo que ya se habia llenado --
  // se limpia al enviar el reporte o al cancelarlo.
  var REPORTE_DRAFT_KEY = "onco_reporte_draft";
  function saveReporteDraft() {
    try { sessionStorage.setItem(REPORTE_DRAFT_KEY, JSON.stringify({ step: reporteWizard.step, data: reporteWizard.data })); } catch (e) {}
  }
  function loadReporteDraft() {
    try { var raw = sessionStorage.getItem(REPORTE_DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function clearReporteDraft() {
    try { sessionStorage.removeItem(REPORTE_DRAFT_KEY); } catch (e) {}
  }

  // "Reportar caso" ya no es una vista/pestana propia -- se abre como
  // modal desde el boton del mismo nombre en "Mis casos". El progreso
  // sigue guardandose en sessionStorage (saveReporteDraft), asi que cerrar
  // el modal (o que se caiga el internet) no borra lo ya diligenciado: la
  // proxima vez que se abra el modal se restaura donde quedo.
  function abrirModalReportarCaso() {
    openModal('<div class="modal-card modal-wide" id="reporte-modal-card">' +
      '<div class="modal-header"><h2>Reportar caso</h2><button class="btn-icon" id="modal-close">' + icon("close") + "</button></div>" +
      '<div id="reporte-modal-body"></div></div>');
    $("modal-close").addEventListener("click", closeModal);

    var draft = loadReporteDraft();
    if (draft && draft.data) {
      reporteWizard.step = draft.step || 0;
      reporteWizard.data = draft.data;
      toast("Se restauró tu reporte sin terminar.");
    } else {
      reporteWizard.step = 0;
      reporteWizard.data = {
        diligenciaNombre: app.currentUser.nombre || "",
        diligenciaTelefono: app.currentUser.telefono || ""
      };
    }
    renderReportarCasoStep();
  }

  function stepperHtml() {
    return '<div class="stepper"><div class="stepper-bars">' + REPORTE_STEPS.map(function (_, i) {
      var cls = i < reporteWizard.step ? "done" : (i === reporteWizard.step ? "current" : "");
      return '<div class="stepper-bar ' + cls + '"></div>';
    }).join("") + '</div><div class="stepper-label">Paso ' + (reporteWizard.step + 1) + " de " + REPORTE_STEPS.length + " · " + REPORTE_STEPS[reporteWizard.step] + "</div></div>";
  }

  function collectStepInputs(ids, checkboxIds) {
    ids.forEach(function (id) { reporteWizard.data[id] = val(id); });
    (checkboxIds || []).forEach(function (id) { reporteWizard.data[id] = checkboxVals(id); });
  }

  function renderReportarCasoStep() {
    saveReporteDraft();
    var d = reporteWizard.data;
    var body = "";
    var stepIds = [];
    var stepCheckboxIds = [];

    if (reporteWizard.step === 0) {
      stepIds = ["diligenciaNombre", "diligenciaTelefono"];
      body = fieldHtml({ id: "diligenciaNombre", label: "Nombre completo de quien diligencia", value: d.diligenciaNombre, required: true }) +
        fieldHtml({ id: "diligenciaTelefono", label: "Teléfono de quien diligencia", type: "tel", value: d.diligenciaTelefono, required: true });
    } else if (reporteWizard.step === 1) {
      stepIds = ["nombres", "apellidos", "tipoDocumento", "numeroDocumento", "edad", "genero", "regimenAfiliacion", "aseguradorEps", "municipio", "ipsAtencionActual", "tipoCancer"];
      body = '<div class="form-row">' +
        fieldHtml({ id: "tipoDocumento", label: "Tipo de documento", type: "select", options: app.picklists.Tipo_Documento, value: d.tipoDocumento, required: true }) +
        fieldHtml({ id: "numeroDocumento", label: "Número de documento", value: d.numeroDocumento, required: true, hint: "Al salir de este campo, se busca si el paciente ya existe." }) +
        "</div>" +
        '<div id="paciente-lookup-notice"></div>' +
        fieldHtml({ id: "nombres", label: "Nombre del paciente", value: d.nombres, required: true }) +
        fieldHtml({ id: "apellidos", label: "Apellidos del paciente", value: d.apellidos, required: true }) +
        '<div class="form-row">' +
        fieldHtml({ id: "edad", label: "Edad", type: "number", value: d.edad, required: true }) +
        fieldHtml({ id: "genero", label: "Género biológico", type: "select", options: ["Femenino", "Masculino"], value: d.genero, required: true }) +
        "</div>" +
        '<div class="form-row">' +
        fieldHtml({ id: "regimenAfiliacion", label: "Régimen de afiliación", type: "select", options: app.picklists.Regimen_Afiliacion, value: d.regimenAfiliacion, required: true }) +
        fieldHtml({ id: "aseguradorEps", label: "Asegurador (EPS)", type: "select", options: app.picklists.Asegurador_EPS, value: d.aseguradorEps, required: true }) +
        "</div>" +
        fieldHtml({ id: "municipio", label: "Municipio de residencia", type: "select", options: app.picklists.Municipio, value: d.municipio, required: true }) +
        fieldHtml({ id: "ipsAtencionActual", label: "IPS donde es atendido hoy", type: "select", options: app.picklists.Ips_Oncologica, value: d.ipsAtencionActual, required: true }) +
        fieldHtml({ id: "tipoCancer", label: "Tipo de cáncer sospechado / con barrera", type: "select", options: app.picklists.Tipo_Cancer, value: d.tipoCancer, required: true });
    } else if (reporteWizard.step === 2) {
      stepIds = ["telefono1", "telefono2", "correo", "direccion", "recomendaciones", "acudienteNombre", "acudienteTelefono", "acudienteDireccion", "acudienteParentesco"];
      body = '<div class="form-row">' +
        fieldHtml({ id: "telefono1", label: "Teléfono 1", type: "tel", value: d.telefono1, required: true }) +
        fieldHtml({ id: "telefono2", label: "Teléfono 2 (opcional)", type: "tel", value: d.telefono2 }) +
        "</div>" +
        fieldHtml({ id: "correo", label: "Correo electrónico (opcional)", type: "email", value: d.correo }) +
        fieldHtml({ id: "direccion", label: "Dirección actual de residencia", value: d.direccion, required: true }) +
        fieldHtml({ id: "recomendaciones", label: "Mejor horario para llamar (opcional)", type: "select", options: HORARIOS_CONTACTO, value: d.recomendaciones, placeholder: "Selecciona un horario" }) +
        '<div class="form-row">' +
        fieldHtml({ id: "acudienteNombre", label: "Nombre del acudiente", value: d.acudienteNombre }) +
        fieldHtml({ id: "acudienteTelefono", label: "Teléfono del acudiente", type: "tel", value: d.acudienteTelefono }) +
        "</div>" +
        '<div class="form-row">' +
        fieldHtml({ id: "acudienteDireccion", label: "Dirección del acudiente", value: d.acudienteDireccion }) +
        fieldHtml({ id: "acudienteParentesco", label: "Parentesco del acudiente", value: d.acudienteParentesco }) +
        "</div>";
    } else if (reporteWizard.step === 3) {
      stepIds = [];
      stepCheckboxIds = ["grupoPoblacional", "factoresCriticidad"];
      body = fieldHtml({ id: "grupoPoblacional", label: "Grupo poblacional (si aplica)", type: "checkboxes", options: app.picklists.Grupo_Poblacional, value: d.grupoPoblacional }) +
        fieldHtml({ id: "factoresCriticidad", label: "Factores de criticidad del caso (opcional)", type: "checkboxes", options: app.picklists.Factores_Criticidad, value: d.factoresCriticidad }) +
        '<div class="field"><label>¿Se ordenó prueba confirmatoria?</label><div class="toggle-pair" id="prueba-ordenada-toggle">' +
        '<div class="toggle-opt ' + (d.pruebaOrdenada === "Si" ? "active" : "") + '" data-value="Si">Sí</div>' +
        '<div class="toggle-opt ' + (d.pruebaOrdenada === "No" ? "active" : "") + '" data-value="No">No</div>' +
        "</div><div class=\"field-hint\">Si eliges \"No\", el caso queda en un estado de seguimiento manual en vez de avanzar directo a autorización (ver README, supuesto 6.1).</div></div>";
    } else {
      body = '<div class="panel">' +
        "<div class=\"panel-title\">" + escapeHtml(d.nombres + " " + d.apellidos) + "</div>" +
        '<div class="panel-subtitle">' + escapeHtml(d.tipoDocumento + " " + d.numeroDocumento + " · " + d.edad + " años · " + d.genero) + "</div>" +
        "<div style=\"font-size:12.5px;color:var(--ink-2);line-height:1.6;\">" +
        escapeHtml(d.municipio) + " · " + escapeHtml(d.aseguradorEps) + " · " + escapeHtml(d.regimenAfiliacion) + "<br/>" +
        "Sospecha: " + escapeHtml(d.tipoCancer) + "<br/>" +
        "IPS actual: " + escapeHtml(d.ipsAtencionActual) + "<br/>" +
        "Prueba confirmatoria ordenada: " + escapeHtml(d.pruebaOrdenada || "No indicado") +
        "</div></div>" +
        '<p class="field-hint" style="margin-top:12px;">Al enviar, se busca si ya existe un paciente con este número de documento (para no duplicarlo) y se crea el caso.</p>';
    }

    var modalBody = $("reporte-modal-body");
    if (!modalBody) return; // el modal se cerro mientras una busqueda async (ej. lookup de paciente) estaba en curso
    modalBody.innerHTML = stepperHtml() +
      '<div class="page-body" style="max-width:none;padding:16px 0 0;">' + body +
      '<div id="reporte-error" class="error-banner" hidden></div>' +
      '<div style="display:flex;gap:10px;margin-top:20px;">' +
      '<button class="btn" id="reporte-prev-btn" ' + (reporteWizard.step === 0 ? "disabled" : "") + ">Anterior</button>" +
      '<button class="btn btn-primary" id="reporte-next-btn" style="flex:1;">' + (reporteWizard.step === REPORTE_STEPS.length - 1 ? "Enviar reporte" : "Siguiente") + "</button>" +
      "</div></div>";

    if (reporteWizard.step === 1) {
      $("numeroDocumento").addEventListener("blur", function () {
        var numero = val("numeroDocumento");
        var notice = $("paciente-lookup-notice");
        if (!numero) { if (notice) notice.innerHTML = ""; return; }
        if (notice) notice.innerHTML = '<div class="notice-box brand">Buscando paciente...</div>';
        buscarPacientePorDocumento(numero).then(function (p) {
          collectStepInputs(stepIds, stepCheckboxIds);
          if (!p) {
            reporteWizard.data.pacienteExistenteId = null;
            renderReportarCasoStep();
            return;
          }
          reporteWizard.data.pacienteExistenteId = p.id;
          reporteWizard.data.nombres = p.Nombres || reporteWizard.data.nombres;
          reporteWizard.data.apellidos = p.Apellidos || reporteWizard.data.apellidos;
          reporteWizard.data.tipoDocumento = p.Tipo_Documento || reporteWizard.data.tipoDocumento;
          reporteWizard.data.edad = p.Edad || reporteWizard.data.edad;
          reporteWizard.data.genero = p.Genero || reporteWizard.data.genero;
          reporteWizard.data.regimenAfiliacion = p.Regimen_Afiliacion || reporteWizard.data.regimenAfiliacion;
          reporteWizard.data.aseguradorEps = p.Asegurador_EPS || reporteWizard.data.aseguradorEps;
          reporteWizard.data.municipio = p.Municipio || reporteWizard.data.municipio;
          reporteWizard.data.ipsAtencionActual = p.Ips_Atencion_Actual || reporteWizard.data.ipsAtencionActual;
          renderReportarCasoStep();
          // Se revisa aparte (sin volver a redibujar todo el paso) si ese
          // paciente ya tiene un caso activo, para avisar de una vez en vez
          // de que el usuario llene los 4 pasos restantes y se entere hasta
          // el final (ver submitReporteCaso / buscarCasoActivoPorPaciente).
          buscarCasoActivoPorPaciente(p.id).then(function (casoActivo) {
            var n = $("paciente-lookup-notice");
            if (!n) return;
            if (casoActivo) {
              n.innerHTML = '<div class="notice-box warn">' + icon("warning") +
                '<div>Paciente existente (' + escapeHtml(p.Name || (p.Nombres + " " + p.Apellidos)) + ') — ya tiene un caso activo: <strong>' +
                escapeHtml(casoActivo.Name || casoActivo.Numero_Caso) + "</strong> (" + escapeHtml(EST_LABELS[casoActivo.Estado_Actual] || casoActivo.Estado_Actual) +
                '). <button type="button" class="btn btn-sm" id="ver-caso-existente-btn" style="margin-top:6px;">Ver caso existente</button></div></div>';
              var btn = $("ver-caso-existente-btn");
              if (btn) btn.addEventListener("click", function () { closeModal(); navigate("detalle_caso", { id: casoActivo.id }); });
            } else {
              n.innerHTML = '<div class="notice-box brand">' + icon("check") + "<div>Paciente existente encontrado (" +
                escapeHtml(p.Name || (p.Nombres + " " + p.Apellidos)) + ") — se precargaron sus datos.</div></div>";
            }
          });
        }).catch(function () { if (notice) notice.innerHTML = ""; });
      });
    }

    if (reporteWizard.step === 3) {
      Array.prototype.forEach.call($("prueba-ordenada-toggle").querySelectorAll(".toggle-opt"), function (opt) {
        opt.addEventListener("click", function () {
          collectStepInputs(stepIds, stepCheckboxIds);
          reporteWizard.data.pruebaOrdenada = opt.dataset.value;
          renderReportarCasoStep();
        });
      });
    }

    $("reporte-prev-btn").addEventListener("click", function () {
      collectStepInputs(stepIds, stepCheckboxIds);
      reporteWizard.step -= 1;
      renderReportarCasoStep();
    });
    $("reporte-next-btn").addEventListener("click", function () {
      collectStepInputs(stepIds, stepCheckboxIds);
      if (reporteWizard.step < REPORTE_STEPS.length - 1) {
        var required = $("reporte-modal-body").querySelectorAll("[required]");
        var missing = Array.prototype.some.call(required, function (i) { return !i.value.trim(); });
        if (missing) { toast("Completa los campos obligatorios."); return; }
        reporteWizard.step += 1;
        renderReportarCasoStep();
        return;
      }
      submitReporteCaso(reporteWizard.data).then(function (result) {
        clearReporteDraft();
        toast("Caso reportado correctamente.");
        // Se muestra de una vez con los datos ya conocidos (ver
        // submitReporteCaso) en vez de esperar a que el buscador de Zoho
        // termine de indexar el registro nuevo.
        var casoLocal = Object.assign({ id: result.id, Ultima_Actualizacion: nowIso() }, result.payload);
        app.casos = app.casos.filter(function (c) { return c.id !== result.id; });
        app.casos.unshift(casoLocal);
        closeModal();
        navigate("detalle_caso", { id: result.id });
        // loadCasos() reemplaza app.casos por completo con lo que devuelva
        // la busqueda de Zoho -- si el indice todavia no alcanzo a indexar
        // el caso recien creado, esa busqueda viene sin el y el caso
        // "optimista" de arriba desaparecia de golpe de "Mis casos". Si
        // sigue faltando despues de recargar, se vuelve a insertar.
        loadCasos().then(function () {
          if (!app.casos.some(function (c) { return c.id === result.id; })) {
            app.casos.unshift(casoLocal);
          }
        }).catch(function () {});
      }).catch(function (err) {
        var box = $("reporte-error");
        box.hidden = false;
        box.textContent = err.message || "No se pudo reportar el caso.";
        if (err.casoExistenteId) {
          var verBtn = document.createElement("button");
          verBtn.className = "btn btn-sm";
          verBtn.style.marginTop = "8px";
          verBtn.textContent = "Ver caso existente";
          verBtn.addEventListener("click", function () {
            closeModal();
            loadCasos().then(function () { navigate("detalle_caso", { id: err.casoExistenteId }); });
          });
          box.appendChild(document.createElement("br"));
          box.appendChild(verBtn);
        }
      });
    });
  }

  // ===================================================================
  // Vista: Mis casos (Gestor ESE) — lista de tarjetas
  // ===================================================================

  var misCasosFiltro = "todos";

  function renderMisCasos() {
    var conAlerta = {};
    loadAlertasBandejaParaCasos().then(function () {
      pintarMisCasos();
    });

    function loadAlertasBandejaParaCasos() {
      // Trae TODAS las alertas pendientes (no solo las que disparo esta
      // institucion) y las cruza contra los casos ya cargados, para que
      // "Con alerta" refleje barreras reportadas por cualquier actor sobre
      // un caso de esta E.S.E. (ej. el Navegador reporta "sin cita" sobre un
      // paciente que el Gestor sigue viendo en su lista).
      if (!FEATURES.alertas) return Promise.resolve();
      var casoIds = {};
      app.casos.forEach(function (c) { casoIds[c.id] = true; });
      return zSearch(MODULES.ALERTAS, eqClause("Estado", "Pendiente"))
        .then(function (rows) { rows.forEach(function (a) { var cid = lookupId(a.Caso); if (casoIds[cid]) conAlerta[cid] = true; }); })
        .catch(function () {});
    }

    function pintarMisCasos() {
      var casos = app.casos.filter(function (c) {
        if (misCasosFiltro === "alerta") return conAlerta[c.id];
        if (misCasosFiltro === "tratamiento") return c.Estado_Actual === EST.TRATAMIENTO_INICIADO;
        return true;
      });

      els.content.innerHTML =
        '<div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">' +
        '<div><div class="title">Mis casos</div><div class="subtitle">Casos reportados por ' + escapeHtml(app.currentUser.institucion) + "</div></div>" +
        '<button class="btn btn-primary" id="btn-reportar-caso">' + icon("plus", 16) + " Reportar caso</button>" +
        "</div>" +
        '<div class="page-body">' +
        '<div class="chip-row">' +
        chip("todos", "Todos (" + app.casos.length + ")") +
        chip("alerta", "Con alerta (" + Object.keys(conAlerta).length + ")") +
        chip("tratamiento", "En tratamiento (" + app.casos.filter(function (c) { return c.Estado_Actual === EST.TRATAMIENTO_INICIADO; }).length + ")") +
        "</div>" +
        '<div class="case-card-list" style="margin-top:12px;">' +
        (casos.length ? casos.map(function (c) { return casoCardHtml(c, conAlerta[c.id]); }).join("") : '<div class="empty-state">No hay casos que coincidan con este filtro.</div>') +
        "</div></div>";

      $("btn-reportar-caso").addEventListener("click", abrirModalReportarCaso);
      Array.prototype.forEach.call(els.content.querySelectorAll(".chip"), function (c) {
        c.addEventListener("click", function () { misCasosFiltro = c.dataset.value; pintarMisCasos(); });
      });
      Array.prototype.forEach.call(els.content.querySelectorAll("[data-caso-id]"), function (c) {
        c.addEventListener("click", function () { navigate("detalle_caso", { id: c.dataset.casoId }); });
      });
    }

    function chip(value, label) {
      return '<div class="chip ' + (misCasosFiltro === value ? "active" : "") + '" data-value="' + value + '">' + label + "</div>";
    }
  }

  function casoCardHtml(c, tieneAlerta) {
    var pill = tieneAlerta ? { cls: "crit", text: "Alerta activa" } : pillForEstado(c.Estado_Actual);
    return '<div class="case-card" data-caso-id="' + c.id + '">' +
      '<div class="case-card-top"><div>' +
      '<div class="case-card-title">' + escapeHtml(c.Name || c.Numero_Caso || ("#" + c.id)) + "</div>" +
      '<div class="case-card-sub">' + escapeHtml(c.Municipio || "") + (c.Municipio ? " · " : "") + escapeHtml(c.Eps_Actual || "") + "</div>" +
      "</div>" + pillHtml(pill) + "</div>" +
      '<div class="case-card-footer">' + escapeHtml(c.Siguiente_Paso || EST_LABELS[c.Estado_Actual] || "") + "</div></div>";
  }

  // ===================================================================
  // Vista: Bandeja de autorizaciones (Lider EPS)
  // ===================================================================

  var bandejaFiltroTipo = "todas";

  function renderBandejaLiderEPS() {
    var pendientes = app.casos.filter(function (c) {
      return c.Estado_Actual === EST.PRUEBA_AUTORIZACION_PENDIENTE || c.Estado_Actual === EST.VALORACION_AUTORIZACION_PENDIENTE;
    });
    pintar();

    function pintar() {
      var filtrados = pendientes.filter(function (c) {
        if (bandejaFiltroTipo === "prueba_confirmatoria") return c.Estado_Actual === EST.PRUEBA_AUTORIZACION_PENDIENTE;
        if (bandejaFiltroTipo === "especialista") return c.Estado_Actual === EST.VALORACION_AUTORIZACION_PENDIENTE;
        return true;
      });
      var conRetraso = pendientes.filter(function (c) { return (daysSince(c.Fecha_de_Reporte) || 0) > 5; }).length;
      var autorizadasSemana = app.casos.filter(function (c) {
        return [EST.PRUEBA_AUTORIZADA, EST.VALORACION_AUTORIZADA].indexOf(c.Estado_Actual) !== -1 && (daysSince(c.Ultima_Actualizacion) || 99) <= 7;
      }).length;

      els.content.innerHTML = pageHeader("Bandeja de autorizaciones", "Solicitudes de prueba confirmatoria y valoración con especialista de tus pacientes afiliados") +
        '<div class="page-body">' +
        '<div class="stat-grid">' +
        statCard("Solicitudes pendientes", pendientes.length) +
        statCard("Con más de 5 días de espera", conRetraso, "crit") +
        statCard("Autorizadas esta semana", autorizadasSemana, "good") +
        "</div>" +
        '<div class="chip-row">' +
        chip("todas", "Todas") + chip("prueba_confirmatoria", "Prueba confirmatoria") + chip("especialista", "Valoración con especialista") +
        "</div>" +
        '<div class="table-wrap" style="margin-top:10px;">' + tablaBandejaHtml(filtrados) + "</div></div>";

      Array.prototype.forEach.call(els.content.querySelectorAll(".chip"), function (c) {
        c.addEventListener("click", function () { bandejaFiltroTipo = c.dataset.value; pintar(); });
      });
      wireCaseRows();
    }

    function chip(value, label) { return '<div class="chip ' + (bandejaFiltroTipo === value ? "active" : "") + '" data-value="' + value + '">' + label + "</div>"; }
  }

  function statCard(label, value, variant, caption) {
    return '<div class="stat-card"><div class="label">' + escapeHtml(label) + '</div><div class="value' + (variant ? " " + variant : "") + '">' + value + "</div>" +
      (caption ? '<div class="caption">' + escapeHtml(caption) + "</div>" : "") + "</div>";
  }

  function tablaBandejaHtml(casos) {
    if (!casos.length) return '<div class="empty-state">No hay solicitudes pendientes.</div>';
    return '<table class="data-table"><thead><tr><th>Paciente</th><th>Municipio</th><th>Tipo de solicitud</th><th>Solicitada</th><th>Espera</th><th></th></tr></thead><tbody>' +
      casos.map(function (c) {
        var dias = daysSince(c.Fecha_de_Reporte) || 0;
        var esperaPill = dias > 5 ? { cls: "crit", text: dias + " días" } : dias > 2 ? { cls: "warn", text: dias + " días" } : { cls: "good", text: dias + (dias === 1 ? " día" : " días") };
        var tipo = c.Estado_Actual.indexOf("Prueba") === 0 ? "Prueba confirmatoria" : "Valoración con especialista";
        return "<tr class=\"clickable\" data-caso-id=\"" + c.id + "\">" +
          '<td class="cell-strong">' + escapeHtml(c.Name || c.Numero_Caso) + "</td>" +
          '<td class="cell-muted">' + escapeHtml(c.Municipio || "-") + "</td>" +
          '<td class="cell-muted">' + tipo + "</td>" +
          '<td class="cell-muted">' + fmtDate(c.Fecha_de_Reporte) + "</td>" +
          "<td>" + pillHtml(esperaPill) + "</td>" +
          '<td class="cell-link">Revisar &rarr;</td></tr>';
      }).join("") + "</tbody></table>";
  }

  function wireCaseRows() {
    Array.prototype.forEach.call(els.content.querySelectorAll("[data-caso-id]"), function (row) {
      row.addEventListener("click", function () { navigate("detalle_caso", { id: row.dataset.casoId }); });
    });
  }

  function renderHistorialLiderEPS() {
    els.content.innerHTML = pageHeader("Historial de casos", "Todos los casos de " + app.currentUser.institucion) +
      '<div class="page-body"><div class="table-wrap">' + tablaGenericaHtml(app.casos) + "</div></div>";
    wireCaseRows();
  }

  function tablaGenericaHtml(casos) {
    if (!casos.length) return '<div class="empty-state">No hay casos para mostrar.</div>';
    return '<table class="data-table"><thead><tr><th>Caso</th><th>Municipio</th><th>Estado</th><th>Última actualización</th><th></th></tr></thead><tbody>' +
      casos.map(function (c) {
        return "<tr class=\"clickable\" data-caso-id=\"" + c.id + "\">" +
          '<td class="cell-strong">' + escapeHtml(c.Name || c.Numero_Caso) + "</td>" +
          '<td class="cell-muted">' + escapeHtml(c.Municipio || "-") + "</td>" +
          "<td>" + pillHtml(pillForEstado(c.Estado_Actual)) + "</td>" +
          '<td class="cell-muted">' + fmtDate(c.Ultima_Actualizacion) + "</td>" +
          '<td class="cell-link">Ver &rarr;</td></tr>';
      }).join("") + "</tbody></table>";
  }

  // ===================================================================
  // Vista: Agenda pendiente / Mis pacientes (Navegador IPS)
  // ===================================================================

  function renderAgendaNavegador() {
    var pendientes = app.casos.filter(function (c) {
      return c.Estado_Actual === EST.PRUEBA_AUTORIZADA || c.Estado_Actual === EST.VALORACION_AUTORIZADA;
    });
    els.content.innerHTML = pageHeader("Agenda de programación", "Casos autorizados a la espera de fecha de prueba o cita con especialista") +
      '<div class="page-body"><div class="table-wrap">' + tablaBandejaHtml(pendientes.map(function (c) { return c; })) + "</div></div>";
    // Reusa la tabla de bandeja pero con etiqueta de tipo distinta segun estado autorizado
    wireCaseRows();
  }

  // ===================================================================
  // Vista: Pacientes (lista + ficha editable) — todos los roles excepto Administrador
  // ===================================================================

  // Definicion de los campos editables de la ficha de paciente, agrupados
  // igual que el formulario de reporte (secciones 2-4 del wizard). Las
  // opciones de picklist se resuelven en el momento (funcion, no array
  // fijo) porque dependen de app.picklists, que ya esta cargado para cuando
  // se pinta esta vista.
  var PACIENTE_FIELD_GROUPS = [
    { titulo: "Datos personales", campos: [
      { key: "Nombres", label: "Nombres", type: "text" },
      { key: "Apellidos", label: "Apellidos", type: "text" },
      { key: "Tipo_Documento", label: "Tipo de documento", type: "select", options: function () { return app.picklists.Tipo_Documento; } },
      { key: "Numero_Documento", label: "Número de documento", type: "text" },
      { key: "Edad", label: "Edad", type: "number" },
      { key: "Genero", label: "Género biológico", type: "select", options: function () { return ["Femenino", "Masculino"]; } },
      { key: "Regimen_Afiliacion", label: "Régimen de afiliación", type: "select", options: function () { return app.picklists.Regimen_Afiliacion; } },
      { key: "Asegurador_EPS", label: "Asegurador (EPS)", type: "select", options: function () { return app.picklists.Asegurador_EPS; } },
      { key: "Municipio", label: "Municipio de residencia", type: "select", options: function () { return app.picklists.Municipio; } },
      { key: "Tipo_Cancer", label: "Tipo de cáncer", type: "select", options: function () { return app.picklists.Tipo_Cancer; } }
    ] },
    { titulo: "Contacto", campos: [
      { key: "Telefono_1", label: "Teléfono 1", type: "tel" },
      { key: "Telefono_2", label: "Teléfono 2", type: "tel" },
      { key: "Correo", label: "Correo electrónico", type: "email" },
      { key: "Direccion", label: "Dirección actual", type: "text" },
      { key: "Recomendaciones_Comunicacion", label: "Mejor horario para llamar", type: "select", options: function () { return HORARIOS_CONTACTO; } }
    ] },
    { titulo: "Grupo poblacional y factores de criticidad", campos: [
      { key: "Grupo_Poblacional", label: "Grupo poblacional", type: "checkboxes", options: function () { return app.picklists.Grupo_Poblacional; } },
      { key: "Factores_Criticidad", label: "Factores de criticidad", type: "checkboxes", options: function () { return app.picklists.Factores_Criticidad; } }
    ] },
    { titulo: "Acudiente", campos: [
      { key: "Acudiente_Nombre", label: "Nombre del acudiente", type: "text" },
      { key: "Acudiente_Telefono", label: "Teléfono del acudiente", type: "tel" },
      { key: "Acudiente_Direccion", label: "Dirección del acudiente", type: "text" },
      { key: "Acudiente_Parentesco", label: "Parentesco del acudiente", type: "text" }
    ] }
  ];

  function pacientesRelevantesParaRol() {
    var vistos = {};
    var lista = [];
    app.casos.forEach(function (c) {
      var pid = lookupId(c.Paciente);
      if (!pid || vistos[pid]) return;
      vistos[pid] = true;
      lista.push(pid);
    });
    return lista;
  }

  function renderListaPacientes() {
    if ($("global-search")) $("global-search").value = "";
    els.content.innerHTML = pageHeader("Pacientes", "Pacientes con casos relacionados a tu institución") +
      '<div class="page-body"><div id="pacientes-lista"><div class="loading-state">Cargando pacientes...</div></div></div>';

    var ids = pacientesRelevantesParaRol();
    Promise.all(ids.map(function (id) { return loadPaciente(id); }))
      .then(function (pacientes) {
        app.pacientesLista = pacientes.filter(Boolean).sort(function (a, b) {
          return (a.Name || "").localeCompare(b.Name || "");
        });
        pintarListaPacientes(app.pacientesLista);
      });
  }

  // El unico buscador de pacientes es el del topbar (#global-search, ver
  // wireGlobalSearch) -- antes habia tambien uno propio de esta vista y
  // quedaban dos buscadores visibles al mismo tiempo, confuso.
  function pintarListaPacientes(pacientes) {
    var cont = $("pacientes-lista");
    if (!cont) return;
    cont.innerHTML = pacientes.length ? tablaPacientesHtml(pacientes) : '<div class="empty-state">No hay pacientes que coincidan.</div>';
    Array.prototype.forEach.call(cont.querySelectorAll("[data-paciente-id]"), function (row) {
      row.addEventListener("click", function () { navigate("detalle_paciente", { id: row.dataset.pacienteId }); });
    });
  }

  function tablaPacientesHtml(pacientes) {
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      "<th>Nombre</th><th>Documento</th><th>Edad</th><th>Género</th><th>Municipio</th><th>EPS</th><th>Sospecha</th><th></th>" +
      "</tr></thead><tbody>" +
      pacientes.map(function (p) {
        return '<tr class="clickable" data-paciente-id="' + p.id + '">' +
          '<td class="cell-strong">' + escapeHtml(p.Name || (p.Nombres + " " + p.Apellidos)) + "</td>" +
          '<td class="cell-muted">' + escapeHtml((p.Tipo_Documento ? p.Tipo_Documento + " " : "") + (p.Numero_Documento || "-")) + "</td>" +
          '<td class="cell-muted">' + escapeHtml(p.Edad ? String(p.Edad) : "-") + "</td>" +
          '<td class="cell-muted">' + escapeHtml(p.Genero || "-") + "</td>" +
          '<td class="cell-muted">' + escapeHtml(p.Municipio || "-") + "</td>" +
          '<td class="cell-muted">' + escapeHtml(p.Asegurador_EPS || "-") + "</td>" +
          '<td class="cell-muted">' + escapeHtml(p.Tipo_Cancer || "-") + "</td>" +
          '<td class="cell-link">Ver &rarr;</td></tr>';
      }).join("") + "</tbody></table></div>";
  }

  function renderDetallePaciente(id) {
    els.content.innerHTML = backHeader("Volver a pacientes") + '<div class="loading-state">Cargando paciente...</div>';
    $("back-btn").addEventListener("click", function () { navigate("pacientes"); });
    loadPaciente(id).then(function (p) {
      if (!p) { toast("No se encontró el paciente."); navigate("pacientes"); return; }
      pintarFichaPaciente(p);
    });
  }

  function pintarFichaPaciente(p) {
    var nombreCompleto = p.Name || (p.Nombres + " " + p.Apellidos);
    var casosDelPaciente = app.casos.filter(function (c) { return lookupId(c.Paciente) === p.id; });

    var right = '<div class="panel paciente-avatar-card">' +
      '<div class="avatar-circle" style="width:56px;height:56px;font-size:19px;margin:0 auto 10px;">' + escapeHtml(initialsOf(nombreCompleto)) + "</div>" +
      '<div style="font-size:15px;font-weight:700;">' + escapeHtml(nombreCompleto) + "</div>" +
      '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + escapeHtml(p.Tipo_Documento || "") + " " + escapeHtml(p.Numero_Documento || "") + "</div>" +
      (p.Edad || p.Genero ? '<div style="font-size:12px;color:var(--ink-2);margin-top:6px;">' + escapeHtml(String(p.Edad || "")) + (p.Edad ? " años" : "") + (p.Genero ? " · " + escapeHtml(p.Genero) : "") + "</div>" : "") +
      "</div>" +
      '<div class="panel" style="margin-top:14px;">' +
      '<div class="panel-title">Casos relacionados</div>' +
      '<div class="panel-subtitle">Solo los visibles para ' + escapeHtml(app.currentUser.institucion || "tu institución") + " — este paciente puede tener otros casos con otras instituciones</div>" +
      (casosDelPaciente.length
        ? '<div class="case-card-list">' + casosDelPaciente.map(function (c) { return casoCardHtml(c, false); }).join("") + "</div>"
        : '<div class="empty-state">Sin casos visibles para tu institución.</div>') +
      "</div>";

    els.content.innerHTML = backHeader("Volver a pacientes") +
      '<div class="page-body" style="display:flex;gap:20px;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:340px;">' +
      PACIENTE_FIELD_GROUPS.map(function (grupo) {
        return '<div class="panel" style="margin-bottom:14px;"><div class="panel-title">' + escapeHtml(grupo.titulo) + '</div><div class="edit-field-grid">' +
          grupo.campos.map(function (def) { return editableFieldHtml(def, p[def.key]); }).join("") +
          "</div></div>";
      }).join("") +
      "</div>" +
      '<div style="width:300px;flex-shrink:0;">' + right + "</div>" +
      "</div>";

    $("back-btn").addEventListener("click", function () { navigate("pacientes"); });
    wireEditableFields(p);
    Array.prototype.forEach.call(els.content.querySelectorAll("[data-caso-id]"), function (row) {
      row.addEventListener("click", function () { navigate("detalle_caso", { id: row.dataset.casoId }); });
    });
  }

  function editableFieldHtml(def, value) {
    var display = def.type === "checkboxes" ? (Array.isArray(value) && value.length ? value.join(", ") : "-") : (value || "-");
    return '<div class="edit-field" data-key="' + def.key + '">' +
      '<div class="edit-field-label">' + escapeHtml(def.label) + '</div>' +
      '<div class="edit-field-view">' +
      '<span class="edit-field-value">' + escapeHtml(String(display)) + '</span>' +
      '<span class="edit-field-pencil">' + icon("edit", 14) + "</span>" +
      "</div></div>";
  }

  // Evita que se abran dos campos a la vez: mientras uno esta en edicion,
  // hay que guardarlo o cancelarlo antes de poder abrir otro.
  function otroCampoEnEdicion(fieldEl) {
    var abierto = els.content.querySelector(".edit-field.editing");
    return abierto && abierto !== fieldEl;
  }

  function wireEditableFields(paciente) {
    Array.prototype.forEach.call(els.content.querySelectorAll(".edit-field"), function (fieldEl) {
      var def = PACIENTE_FIELD_GROUPS.reduce(function (acc, g) { return acc || g.campos.find(function (c) { return c.key === fieldEl.dataset.key; }); }, null);
      if (!def) return;
      fieldEl.querySelector(".edit-field-view").addEventListener("click", function () {
        if (fieldEl.classList.contains("editing")) return;
        if (otroCampoEnEdicion(fieldEl)) { toast("Guarda o cancela el campo que estás editando antes de abrir otro."); return; }
        abrirEdicionCampo(fieldEl, def, paciente);
      });
    });
  }

  function abrirEdicionCampo(fieldEl, def, paciente) {
    fieldEl.classList.add("editing");
    els.content.classList.add("campo-en-edicion");
    var valorActual = paciente[def.key];
    var inputHtml;
    if (def.type === "select") {
      inputHtml = '<select class="edit-field-input">' + optionsHtml(def.options() || [], valorActual) + "</select>";
    } else if (def.type === "checkboxes") {
      var seleccionados = Array.isArray(valorActual) ? valorActual : [];
      inputHtml = '<div class="checkbox-group edit-field-input">' + (def.options() || []).map(function (o) {
        var checked = seleccionados.indexOf(o) !== -1 ? " checked" : "";
        return '<label class="checkbox-option"><input type="checkbox" value="' + escapeHtml(o) + '"' + checked + " />" + escapeHtml(o) + "</label>";
      }).join("") + "</div>";
    } else {
      inputHtml = '<input class="edit-field-input" type="' + def.type + '" value="' + escapeHtml(valorActual || "") + '"' +
        (def.type === "tel" ? ' inputmode="numeric" pattern="[0-9]*"' : "") + " />";
    }
    fieldEl.querySelector(".edit-field-view").outerHTML = '<div class="edit-field-editing">' + inputHtml +
      '<div class="edit-field-actions">' +
      '<button type="button" class="btn-icon edit-field-save">' + icon("check", 15) + "</button>" +
      '<button type="button" class="btn-icon edit-field-cancel">' + icon("close", 15) + "</button>" +
      "</div></div>";

    var inputEl = fieldEl.querySelector(".edit-field-input");
    if (inputEl && inputEl.tagName !== "DIV") inputEl.focus();

    fieldEl.querySelector(".edit-field-cancel").addEventListener("click", function () {
      fieldEl.classList.remove("editing");
      els.content.classList.remove("campo-en-edicion");
      fieldEl.querySelector(".edit-field-editing").outerHTML = editViewHtml(def, paciente[def.key]);
      wireEditableFieldView(fieldEl, def, paciente);
    });
    fieldEl.querySelector(".edit-field-save").addEventListener("click", function () {
      guardarCampoPaciente(fieldEl, def, paciente);
    });
  }

  function editViewHtml(def, value) {
    var display = def.type === "checkboxes" ? (Array.isArray(value) && value.length ? value.join(", ") : "-") : (value || "-");
    return '<div class="edit-field-view"><span class="edit-field-value">' + escapeHtml(String(display)) + '</span>' +
      '<span class="edit-field-pencil">' + icon("edit", 14) + "</span></div>";
  }

  function wireEditableFieldView(fieldEl, def, paciente) {
    fieldEl.querySelector(".edit-field-view").addEventListener("click", function () {
      if (fieldEl.classList.contains("editing")) return;
      if (otroCampoEnEdicion(fieldEl)) { toast("Guarda o cancela el campo que estás editando antes de abrir otro."); return; }
      abrirEdicionCampo(fieldEl, def, paciente);
    });
  }

  function guardarCampoPaciente(fieldEl, def, paciente) {
    var nuevoValor;
    if (def.type === "checkboxes") {
      nuevoValor = Array.prototype.slice.call(fieldEl.querySelectorAll('input[type="checkbox"]:checked')).map(function (el) { return el.value; });
    } else {
      var inputEl = fieldEl.querySelector(".edit-field-input");
      nuevoValor = inputEl.value.trim();
      if (def.type === "number") nuevoValor = nuevoValor ? Number(nuevoValor) : null;
    }
    var payload = {};
    payload[def.key] = nuevoValor;
    setBusy(true);
    zUpdate(MODULES.PACIENTES, paciente.id, payload).then(function () {
      paciente[def.key] = nuevoValor;
      if (app.pacientesById[paciente.id]) app.pacientesById[paciente.id][def.key] = nuevoValor;
      toast("Guardado.");
      fieldEl.classList.remove("editing");
      els.content.classList.remove("campo-en-edicion");
      fieldEl.querySelector(".edit-field-editing").outerHTML = editViewHtml(def, nuevoValor);
      wireEditableFieldView(fieldEl, def, paciente);
    }).catch(function (err) {
      toast(err.message || "No se pudo guardar.");
    }).then(function () { setBusy(false); });
  }

  // ===================================================================
  // Vista: Todos los casos (Administrador)
  // ===================================================================

  // ===================================================================
  // Utilidades compartidas por las vistas de graficas/estadisticas
  // ===================================================================

  function barreraLabel(v) {
    var def = BARRERAS.find(function (b) { return b.value === v; });
    return def ? def.label : v;
  }

  function barsChartHtml(items, max) {
    return '<div class="bars-chart">' + items.map(function (it) {
      return '<div class="bars-chart-col"><div class="bars-chart-value">' + it.value + '</div><div class="bars-chart-bar" style="height:' + Math.max(4, Math.round((it.value / max) * 130)) + 'px;"></div></div>';
    }).join("") + '</div><div class="bars-chart-labels">' + items.map(function (it) {
      return '<div class="bars-chart-label" title="' + escapeHtml(it.label) + '">' + escapeHtml(it.label) + "</div>";
    }).join("") + "</div>";
  }

  function hbarsHtml(items, max) {
    return items.map(function (it) {
      return '<div class="hbar-row"><div class="hbar-head"><span>' + escapeHtml(it.label) + "</span><strong>" + it.value + '</strong></div><div class="hbar-track"><div class="hbar-fill" style="width:' + Math.max(4, Math.round((it.value / max) * 100)) + '%;"></div></div></div>';
    }).join("");
  }

  // Paleta categorica fija (mismo orden siempre, no se reasigna por dato) --
  // se usa para donas/pastel en vez de listas horizontales cuando hay pocas
  // categorias (2 a ~7), que es cuando un pastel se lee mejor que una barra.
  var DASH_CHART_COLORS = ["#4c54a8", "#e0384a", "#0f9d4e", "#e2a400", "#7078c8", "#2aa8a0", "#9c6ade", "#c2410c"];

  // Grafica de dona con leyenda (numero + %), estilo reporte de Zoho
  // Analytics. items ya viene ordenado (como lo entrega groupCount/etc).
  function donutChartHtml(items, opts) {
    opts = opts || {};
    var total = items.reduce(function (s, it) { return s + it.value; }, 0) || 1;
    var size = opts.size || 132, stroke = opts.stroke || 22;
    var r = (size - stroke) / 2, c = 2 * Math.PI * r;
    var offset = 0;
    var segmentos = items.map(function (it, i) {
      var len = (it.value / total) * c;
      var svg = '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + r + '" fill="none" stroke="' + DASH_CHART_COLORS[i % DASH_CHART_COLORS.length] +
        '" stroke-width="' + stroke + '" stroke-dasharray="' + len + " " + (c - len) + '" stroke-dashoffset="' + (-offset) +
        '" transform="rotate(-90 ' + (size / 2) + " " + (size / 2) + ')"></circle>';
      offset += len;
      return svg;
    }).join("");
    var centro = opts.sinTotal ? "" :
      '<text x="50%" y="46%" text-anchor="middle" class="donut-total-value">' + total + "</text>" +
      '<text x="50%" y="61%" text-anchor="middle" class="donut-total-label">' + escapeHtml(opts.centerText || "Total") + "</text>";
    var svgHtml = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '">' + segmentos + centro + "</svg>";
    var leyenda = '<div class="donut-legend">' + items.map(function (it, i) {
      var pct = Math.round((it.value / total) * 100);
      return '<div class="donut-legend-row"><span class="donut-dot" style="background:' + DASH_CHART_COLORS[i % DASH_CHART_COLORS.length] + '"></span>' +
        '<span class="donut-legend-label">' + escapeHtml(it.label) + '</span><span class="donut-legend-value">' + it.value + " · " + pct + "%</span></div>";
    }).join("") + "</div>";
    return '<div class="donut-chart-wrap"><div class="donut-chart-svg">' + svgHtml + "</div>" + leyenda + "</div>";
  }

  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    return { r: parseInt(hex.substr(0, 2), 16), g: parseInt(hex.substr(2, 2), 16), b: parseInt(hex.substr(4, 2), 16) };
  }
  function mezclarColor(hexA, hexB, t) {
    var a = hexToRgb(hexA), b = hexToRgb(hexB);
    return "rgb(" + Math.round(a.r + (b.r - a.r) * t) + "," + Math.round(a.g + (b.g - a.g) * t) + "," + Math.round(a.b + (b.b - a.b) * t) + ")";
  }

  // "Mapa de calor" de municipios: no es un mapa geografico real (no hay
  // datos de fronteras de los 64 municipios de Narino disponibles, y traer
  // un mapa real implicaria agregar un servicio externo de mapas al widget
  // -- riesgo de CSP/sandbox dentro del portal de Zoho, ver README). En vez
  // de eso, cada municipio es una celda coloreada segun cuantos casos tiene
  // (escala secuencial clara->oscura), clickeable para filtrar.
  function heatmapMunicipiosHtml(items) {
    if (!items.length) return '<div class="empty-state">Sin casos con municipio registrado.</div>';
    var max = Math.max.apply(null, items.map(function (x) { return x.value; }));
    var min = Math.min.apply(null, items.map(function (x) { return x.value; }));
    return '<div class="dash-heatmap">' + items.map(function (it) {
      var t = max === min ? 1 : (it.value - min) / (max - min);
      var bg = mezclarColor("#e7ebfb", "#3a4090", t);
      return '<div class="heat-cell' + (t > 0.55 ? " heat-cell-dark" : "") + '" data-municipio="' + escapeHtml(it.label) +
        '" style="background:' + bg + ';" title="' + escapeHtml(it.label) + ": " + it.value + ' caso(s)">' +
        '<div class="heat-cell-value">' + it.value + '</div><div class="heat-cell-label">' + escapeHtml(it.label) + "</div></div>";
    }).join("") + "</div>";
  }

  function diffDias(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  function promedio(arr) { if (!arr.length) return "-"; return Math.round(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length); }

  function groupCount(arr, field) {
    var m = {};
    arr.forEach(function (x) {
      var v = x[field];
      if (v === undefined || v === null || v === "") v = "Sin dato";
      if (Array.isArray(v)) { if (!v.length) m["Sin dato"] = (m["Sin dato"] || 0) + 1; else v.forEach(function (vv) { m[vv] = (m[vv] || 0) + 1; }); }
      else m[v] = (m[v] || 0) + 1;
    });
    return Object.keys(m).map(function (k) { return { label: k, value: m[k] }; }).sort(function (a, b) { return b.value - a.value; });
  }

  var MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function mesLabel(key) { var p = key.split("-"); return MESES_CORTOS[Number(p[1]) - 1] + " " + p[0].slice(2); }

  // Mapea cada Estado_Actual al indice de TIMELINE_STAGES que implica haber
  // alcanzado (para el funnel de la pestana "Ruta oncologica" -- usa solo
  // Estado_Actual, no el historial de eventos, para no tener que traer los
  // eventos de TODOS los casos solo para dibujar el resumen por etapa).
  var ESTADO_A_ETAPA_INDEX = {};

  // ===================================================================
  // Vista: Dashboard Administrativo (Administrador) -- con tabs, filtros
  // globales y drill-down. Reutiliza los datos ya cargados en memoria
  // (app.casos, app.alertas) -- no dispara consultas nuevas a Zoho al
  // entrar, salvo en las pestanas "Pacientes"/"Gestion"/"Indicadores" que
  // si necesitan datos que no estan en Onco_Casos (pacientes u eventos), y
  // esas los cargan solo cuando se abren (perezoso), no al arrancar.
  // ===================================================================

  var DASH_TABS = [
    { id: "resumen", label: "Resumen" },
    { id: "pacientes", label: "Pacientes" },
    { id: "ruta", label: "Ruta oncológica" },
    { id: "riesgo", label: "Riesgo y alertas" },
    { id: "gestion", label: "Gestión" },
    { id: "indicadores", label: "Indicadores" }
  ];

  var dashState, dashCache;

  function renderDashboardAdmin() {
    dashState = {
      tab: "resumen",
      filtros: { estado: "", municipio: "", eps: "", ips: "" },
      pacientesQuery: "", pacientesPage: 1
    };
    dashCache = { pacientes: null, pacientesKey: null, eventos: null, eventosKey: null };
    pintarDashboardShell();
  }

  // ---------- Datos derivados (filtros globales + quick filter + busqueda) ----------

  function dashValoresUnicos(campo) {
    var vistos = {}, out = [];
    app.casos.forEach(function (c) { var v = c[campo]; if (v && !vistos[v]) { vistos[v] = true; out.push(v); } });
    return out.sort();
  }

  // Respeta los 4 filtros globales (estado/municipio/eps/ips), pero no el
  // quick filter ni la busqueda de texto -- es la base que usan los KPIs y
  // graficas de Resumen/Ruta/Riesgo/Indicadores/Gestion.
  function dashCasosBase() {
    var f = dashState.filtros;
    return app.casos.filter(function (c) {
      if (f.estado && c.Estado_Actual !== f.estado) return false;
      if (f.municipio && c.Municipio !== f.municipio) return false;
      if (f.eps && c.Eps_Actual !== f.eps) return false;
      if (f.ips && c.Ips_Oncologica_Actual !== f.ips) return false;
      return true;
    });
  }

  // "Atrasado" aqui es un proxy honesto de inactividad -- no hay un SLA/
  // fecha limite definida en el modelo de datos, asi que se mide como
  // "sin ninguna actualizacion registrada en mas de 7 dias", no como el
  // incumplimiento de una meta formal.
  function esCasoAtrasado(c) {
    if (TERMINALES.indexOf(c.Estado_Actual) !== -1) return false;
    var dias = daysSince(c.Ultima_Actualizacion || c.Fecha_de_Reporte);
    return dias !== null && dias > 7;
  }

  function dashQuickFilterLabel(qf) {
    var m = {
      activos: "Casos activos", prevalencia: "Prevalencia gestionada (malignidad confirmada, en seguimiento)",
      barreras: "Casos con barrera de acceso pendiente", atrasados: "Casos sin actualizar hace más de 7 días",
      cerrados: "Casos cerrados", fallecidos: "Casos fallecidos", altaIncidencia: "Casos en municipios de alta incidencia"
    };
    return m[qf] || "";
  }

  // Aplica un "filtro rapido" (el de los KPIs/drill-down) sobre la base ya
  // filtrada por los 4 filtros globales. Ya no navega a ninguna pestana --
  // el resultado se muestra en el modal flotante (ver abrirModalListaCasos).
  function dashCasosParaQuickFilter(qf) {
    var lista = dashCasosBase();
    if (!qf) return lista;
    var idsConBarrera = null;
    if (qf === "barreras") {
      idsConBarrera = {};
      app.alertas.forEach(function (a) { if (a.Estado !== "Atendida") idsConBarrera[lookupId(a.Caso)] = true; });
    }
    return lista.filter(function (c) {
      if (qf === "activos") return TERMINALES.indexOf(c.Estado_Actual) === -1;
      if (qf === "prevalencia") return ESTADOS_EN_SEGUIMIENTO_CONFIRMADO.indexOf(c.Estado_Actual) !== -1;
      if (qf === "cerrados") return TERMINALES.indexOf(c.Estado_Actual) !== -1;
      if (qf === "fallecidos") return c.Estado_Actual === EST.CASO_FALLECIDO;
      if (qf === "altaIncidencia") return MUNICIPIOS_ALTA_INCIDENCIA.indexOf(c.Municipio) !== -1;
      if (qf === "atrasados") return esCasoAtrasado(c);
      if (qf === "barreras") return !!idsConBarrera[c.id];
      return true;
    });
  }

  // ---------- Modal flotante de drill-down (reemplaza la antigua pestana "Detalle") ----------

  function abrirModalListaCasos(titulo, casos) {
    openModal('<div class="modal-card modal-wide" id="dash-drill-modal">' +
      '<div class="modal-header"><h2>' + escapeHtml(titulo) + "</h2><button type=\"button\" class=\"btn-icon\" id=\"modal-close\">" + icon("close") + "</button></div>" +
      '<div class="field" style="max-width:320px;margin-bottom:12px;"><input type="text" id="dash-drill-buscar" placeholder="Buscar por caso, municipio o EPS..." /></div>' +
      '<div id="dash-drill-tabla"></div></div>');
    $("modal-close").addEventListener("click", closeModal);

    var local = { query: "", page: 1 };
    $("dash-drill-buscar").addEventListener("input", function () { local.query = this.value; local.page = 1; pintar(); });
    pintar();

    function pintar() {
      var cont = $("dash-drill-tabla");
      if (!cont) return;
      var q = local.query.trim().toLowerCase();
      var filtrados = !q ? casos : casos.filter(function (c) {
        return (c.Name || "").toLowerCase().indexOf(q) !== -1 ||
          (c.Municipio || "").toLowerCase().indexOf(q) !== -1 ||
          (c.Eps_Actual || "").toLowerCase().indexOf(q) !== -1;
      });
      var pageSize = 10;
      var totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
      if (local.page > totalPages) local.page = totalPages;
      var pageItems = filtrados.slice((local.page - 1) * pageSize, local.page * pageSize);
      cont.innerHTML = (filtrados.length ? '<div class="table-wrap">' + tablaGenericaHtml(pageItems) + "</div>" : '<div class="empty-state">Sin resultados.</div>') +
        dashPaginacionHtml(filtrados.length, local.page, totalPages, "dash-drill");
      Array.prototype.forEach.call(cont.querySelectorAll("[data-caso-id]"), function (row) {
        row.addEventListener("click", function () { closeModal(); navigate("detalle_caso", { id: row.dataset.casoId }); });
      });
      var prev = $("dash-drill-prev"); if (prev) prev.addEventListener("click", function () { local.page--; pintar(); });
      var next = $("dash-drill-next"); if (next) next.addEventListener("click", function () { local.page++; pintar(); });
    }
  }

  function abrirModalListaPacientes() {
    openModal('<div class="modal-card modal-wide" id="dash-drill-modal">' +
      '<div class="modal-header"><h2>Total pacientes</h2><button type="button" class="btn-icon" id="modal-close">' + icon("close") + "</button></div>" +
      '<div id="dash-drill-body"><div class="loading-state">Cargando pacientes...</div></div></div>');
    $("modal-close").addEventListener("click", closeModal);

    var ids = dashPacienteIdsFiltrados();
    Promise.all(ids.slice(0, 300).map(function (id) { return loadPaciente(id); })).then(function (pacientes) {
      var body = $("dash-drill-body");
      if (!body) return; // el modal ya se cerro mientras cargaba
      pacientes = pacientes.filter(Boolean);
      body.innerHTML = '<div class="field" style="max-width:320px;margin-bottom:12px;"><input type="text" id="dash-drill-buscar" placeholder="Buscar por nombre o documento..." /></div><div id="dash-drill-tabla"></div>';

      var local = { query: "", page: 1 };
      $("dash-drill-buscar").addEventListener("input", function () { local.query = this.value; local.page = 1; pintar(); });
      pintar();

      function pintar() {
        var cont = $("dash-drill-tabla");
        if (!cont) return;
        var q = local.query.trim().toLowerCase();
        var filtrados = !q ? pacientes : pacientes.filter(function (p) {
          return (p.Name || "").toLowerCase().indexOf(q) !== -1 || (p.Numero_Documento || "").toLowerCase().indexOf(q) !== -1;
        });
        var pageSize = 10;
        var totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
        if (local.page > totalPages) local.page = totalPages;
        var pageItems = filtrados.slice((local.page - 1) * pageSize, local.page * pageSize);
        cont.innerHTML = (filtrados.length ? tablaPacientesHtml(pageItems) : '<div class="empty-state">Sin resultados.</div>') +
          dashPaginacionHtml(filtrados.length, local.page, totalPages, "dash-drill");
        Array.prototype.forEach.call(cont.querySelectorAll("[data-paciente-id]"), function (row) {
          row.addEventListener("click", function () { closeModal(); navigate("detalle_paciente", { id: row.dataset.pacienteId }); });
        });
        var prev = $("dash-drill-prev"); if (prev) prev.addEventListener("click", function () { local.page--; pintar(); });
        var next = $("dash-drill-next"); if (next) next.addEventListener("click", function () { local.page++; pintar(); });
      }
    });
  }

  function dashPacienteIdsFiltrados() {
    var vistos = {}, lista = [];
    dashCasosBase().forEach(function (c) { var pid = lookupId(c.Paciente); if (pid && !vistos[pid]) { vistos[pid] = true; lista.push(pid); } });
    return lista;
  }

  // Eventos (Onco_Tareas) de los casos ya filtrados, para "Gestión" e
  // "Indicadores" -- se cachean mientras los filtros globales no cambien
  // (JSON.stringify de dashState.filtros como llave), para no repetir la
  // misma tanda de consultas al cambiar de pestana. Igual que en el resto
  // de la app, se limita a los N casos actualizados mas recientemente (no
  // el historico completo) para no disparar cientos de consultas.
  function dashCargarEventos() {
    var key = JSON.stringify(dashState.filtros);
    if (dashCache.eventos && dashCache.eventosKey === key) return Promise.resolve(dashCache.eventos);
    var candidatos = dashCasosBase().slice()
      .sort(function (a, b) { return new Date(b.Ultima_Actualizacion || b.Fecha_de_Reporte || 0) - new Date(a.Ultima_Actualizacion || a.Fecha_de_Reporte || 0); })
      .slice(0, 80);
    return Promise.all(candidatos.map(function (c) { return loadEventosDeCaso(c.id).then(function (evs) { return { caso: c, eventos: evs }; }); }))
      .then(function (pares) { dashCache.eventos = pares; dashCache.eventosKey = key; return pares; });
  }

  // ---------- Shell: encabezado + filtros + tabs ----------

  function pintarDashboardShell() {
    els.content.innerHTML =
      '<div class="page-body" style="padding-top:22px;">' +
      dashFiltrosHtml() +
      '<div class="detalle-tabs" id="dash-tabs" style="overflow-x:auto;flex-wrap:nowrap;">' + DASH_TABS.map(function (t) {
        return '<button class="detalle-tab-btn' + (dashState.tab === t.id ? " active" : "") + '" data-tab="' + t.id + '" style="white-space:nowrap;flex-shrink:0;">' + escapeHtml(t.label) + "</button>";
      }).join("") + "</div>" +
      '<div id="dash-tab-body"></div>' +
      "</div>";

    wireDashFiltros();
    Array.prototype.forEach.call($("dash-tabs").querySelectorAll(".detalle-tab-btn"), function (btn) {
      btn.addEventListener("click", function () { dashState.tab = btn.dataset.tab; pintarDashboardShell(); });
    });
    pintarDashTabActivo();
  }

  function dashFiltrosHtml() {
    var f = dashState.filtros;
    var hayFiltros = f.estado || f.municipio || f.eps || f.ips;
    return '<div class="dash-filtros">' +
      dashFiltroSelectHtml("dash-f-estado", "Estado", Object.keys(EST).map(function (k) { return EST[k]; }), f.estado, EST_LABELS) +
      dashFiltroSelectHtml("dash-f-municipio", "Municipio", dashValoresUnicos("Municipio"), f.municipio) +
      dashFiltroSelectHtml("dash-f-eps", "EPS", dashValoresUnicos("Eps_Actual"), f.eps) +
      dashFiltroSelectHtml("dash-f-ips", "IPS oncológica", dashValoresUnicos("Ips_Oncologica_Actual"), f.ips) +
      (hayFiltros ? '<button type="button" class="btn btn-sm" id="dash-f-limpiar">' + icon("close", 13) + " Limpiar filtros</button>" : "") +
      "</div>";
  }

  function dashFiltroSelectHtml(id, placeholder, values, selected, labelMap) {
    return '<select id="' + id + '" class="dash-filtro-select">' +
      '<option value="">' + escapeHtml(placeholder) + "</option>" +
      values.map(function (v) {
        var label = labelMap ? (labelMap[v] || v) : v;
        return '<option value="' + escapeHtml(v) + '"' + (v === selected ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
      }).join("") + "</select>";
  }

  function wireDashFiltros() {
    ["estado", "municipio", "eps", "ips"].forEach(function (k) {
      var el = $("dash-f-" + k);
      if (!el) return;
      el.addEventListener("change", function () {
        dashState.filtros[k] = el.value;
        pintarDashboardShell();
      });
    });
    var limpiar = $("dash-f-limpiar");
    if (limpiar) limpiar.addEventListener("click", function () {
      dashState.filtros = { estado: "", municipio: "", eps: "", ips: "" };
      pintarDashboardShell();
    });
  }

  function pintarDashTabActivo() {
    var body = $("dash-tab-body");
    if (!body) return;
    if (dashState.tab === "resumen") return pintarDashResumen(body);
    if (dashState.tab === "pacientes") return pintarDashPacientes(body);
    if (dashState.tab === "ruta") return pintarDashRuta(body);
    if (dashState.tab === "riesgo") return pintarDashRiesgo(body);
    if (dashState.tab === "gestion") return pintarDashGestion(body);
    if (dashState.tab === "indicadores") return pintarDashIndicadores(body);
  }

  function dashKpiHtml(id, label, value, variant, caption, iconName) {
    return '<div class="stat-card dash-kpi" data-dash-kpi="' + id + '">' +
      (iconName ? '<div class="dash-kpi-icon' + (variant ? " " + variant : "") + '">' + icon(iconName, 16) + "</div>" : "") +
      '<div class="label">' + escapeHtml(label) + '</div><div class="value' +
      (variant ? " " + variant : "") + '">' + value + "</div>" + (caption ? '<div class="caption">' + escapeHtml(caption) + "</div>" : "") + "</div>";
  }
  function wireDashKpis(body) {
    Array.prototype.forEach.call(body.querySelectorAll("[data-dash-kpi]"), function (card) {
      card.addEventListener("click", function () {
        var kpi = card.dataset.dashKpi;
        if (kpi === "pacientes") { abrirModalListaPacientes(); return; }
        abrirModalListaCasos(dashQuickFilterLabel(kpi), dashCasosParaQuickFilter(kpi));
      });
    });
  }

  // ---------- Tab: Resumen ----------

  function pintarDashResumen(body) {
    var base = dashCasosBase();
    var pacientesUnicos = {};
    base.forEach(function (c) { var pid = lookupId(c.Paciente); if (pid) pacientesUnicos[pid] = true; });
    var totalPacientes = Object.keys(pacientesUnicos).length;
    var activos = base.filter(function (c) { return TERMINALES.indexOf(c.Estado_Actual) === -1; }).length;
    var prevalencia = base.filter(function (c) { return ESTADOS_EN_SEGUIMIENTO_CONFIRMADO.indexOf(c.Estado_Actual) !== -1; }).length;
    var cerrados = base.filter(function (c) { return TERMINALES.indexOf(c.Estado_Actual) !== -1; }).length;
    var fallecidos = base.filter(function (c) { return c.Estado_Actual === EST.CASO_FALLECIDO; }).length;
    var atrasados = base.filter(esCasoAtrasado).length;
    var idsBase = {}; base.forEach(function (c) { idsBase[c.id] = true; });
    var barrerasPendientes = app.alertas.filter(function (a) { return a.Estado !== "Atendida" && idsBase[lookupId(a.Caso)]; }).length;

    var porMes = {};
    base.forEach(function (c) { if (!c.Fecha_de_Reporte) return; var d = new Date(c.Fecha_de_Reporte); var key = d.getFullYear() + "-" + pad(d.getMonth() + 1); porMes[key] = (porMes[key] || 0) + 1; });
    var evolucion = Object.keys(porMes).sort().slice(-6).map(function (k) { return { label: mesLabel(k), value: porMes[k] }; });
    var maxEvolucion = Math.max.apply(null, evolucion.map(function (x) { return x.value; }).concat([1]));

    var porEstado = {};
    base.forEach(function (c) { porEstado[c.Estado_Actual] = (porEstado[c.Estado_Actual] || 0) + 1; });
    var estadoItems = Object.keys(porEstado).map(function (k) { return { label: EST_LABELS[k] || k, value: porEstado[k] }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 6);

    var porBarrera = {};
    app.alertas.filter(function (a) { return a.Estado !== "Atendida" && idsBase[lookupId(a.Caso)]; }).forEach(function (a) { var t = a.Tipo_Barrera || "Otro"; porBarrera[t] = (porBarrera[t] || 0) + 1; });
    var barrerasTop = Object.keys(porBarrera).map(function (t) { return { label: barreraLabel(t), value: porBarrera[t] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 4);
    var maxBarreraTop = Math.max.apply(null, barrerasTop.map(function (x) { return x.value; }).concat([1]));

    var porMunicipio = {};
    base.forEach(function (c) { if (c.Municipio) porMunicipio[c.Municipio] = (porMunicipio[c.Municipio] || 0) + 1; });
    var municipioItems = Object.keys(porMunicipio).map(function (m) { return { label: m, value: porMunicipio[m] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 18);

    var actividad = casosConCambiosRecientes().filter(function (c) { return idsBase[c.id]; }).slice(0, 6);

    body.innerHTML =
      '<div class="dash-hero">' +
      '<div class="dash-hero-metric"><span class="dash-hero-value">' + activos + '</span><span class="dash-hero-label">casos activos en la ruta oncológica</span></div>' +
      '<div class="dash-hero-sub">' + totalPacientes + " pacientes en seguimiento · " + barrerasPendientes + " barrera(s) pendiente(s) · " + cerrados + " caso(s) cerrado(s)</div>" +
      "</div>" +
      '<div class="stat-grid">' +
      dashKpiHtml("pacientes", "Total pacientes", totalPacientes, "", "", "users") +
      dashKpiHtml("activos", "Casos activos", activos, "good", "", "file") +
      dashKpiHtml("prevalencia", "Prevalencia gestionada", prevalencia, "", "", "contact") +
      dashKpiHtml("barreras", "Barreras pendientes", barrerasPendientes, barrerasPendientes ? "crit" : "", "", "warning") +
      dashKpiHtml("atrasados", "Sin actualizar +7 días", atrasados, atrasados ? "crit" : "", "", "calendar") +
      dashKpiHtml("cerrados", "Casos cerrados", cerrados, "", "", "check") +
      dashKpiHtml("fallecidos", "Casos fallecidos", fallecidos, "", "", "warning") +
      "</div>" +
      '<div class="panel" style="margin-top:14px;">' +
      '<div class="panel-title">Casos por municipio</div><div class="panel-subtitle">Mapa de calor · clic en un municipio para filtrar</div>' +
      heatmapMunicipiosHtml(municipioItems) +
      "</div>" +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;">' +
      '<div class="panel" style="flex:1.4;min-width:320px;">' +
      '<div class="panel-title">Casos reportados por mes</div><div class="panel-subtitle">Últimos ' + evolucion.length + " meses</div>" +
      (evolucion.length ? barsChartHtml(evolucion, maxEvolucion) : '<div class="empty-state">Sin datos suficientes.</div>') +
      "</div>" +
      '<div class="panel" style="flex:1;min-width:280px;">' +
      '<div class="panel-title">Distribución por estado</div><div class="panel-subtitle">Top ' + estadoItems.length + "</div>" +
      (estadoItems.length ? donutChartHtml(estadoItems, { centerText: "Casos" }) : '<div class="empty-state">Sin casos.</div>') +
      "</div></div>" +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;">' +
      '<div class="panel" style="flex:1;min-width:280px;">' +
      '<div class="panel-title">Principales barreras activas</div>' +
      (barrerasTop.length ? hbarsHtml(barrerasTop, maxBarreraTop) : '<div class="empty-state">No hay barreras activas.</div>') +
      "</div>" +
      '<div class="panel" style="flex:1.2;min-width:300px;">' +
      '<div class="panel-title">Actividad reciente</div><div class="panel-subtitle">Cambios de estado en los últimos 14 días</div>' +
      (actividad.length ? '<div class="notif-list">' + actividad.map(notifItemCasoHtml).join("") + "</div>" : '<div class="empty-state">Sin cambios recientes.</div>') +
      "</div></div>";

    wireDashKpis(body);
    wireDashHeatmap(body);
    Array.prototype.forEach.call(body.querySelectorAll("[data-caso-id]"), function (row) {
      row.addEventListener("click", function () { navigate("detalle_caso", { id: row.dataset.casoId }); });
    });
  }

  function wireDashHeatmap(body) {
    Array.prototype.forEach.call(body.querySelectorAll("[data-municipio]"), function (cell) {
      cell.addEventListener("click", function () {
        var municipio = cell.dataset.municipio;
        var lista = dashCasosBase().filter(function (c) { return c.Municipio === municipio; });
        abrirModalListaCasos("Casos en " + municipio, lista);
      });
    });
  }

  // ---------- Tab: Pacientes ----------

  function pintarDashPacientes(body) {
    var key = JSON.stringify(dashState.filtros);
    if (dashCache.pacientes && dashCache.pacientesKey === key) { pintarDashPacientesBody(body); return; }
    body.innerHTML = '<div class="loading-state">Cargando pacientes...</div>';
    var ids = dashPacienteIdsFiltrados();
    Promise.all(ids.slice(0, 300).map(function (id) { return loadPaciente(id); })).then(function (pacientes) {
      dashCache.pacientes = pacientes.filter(Boolean);
      dashCache.pacientesKey = key;
      dashState.pacientesQuery = ""; dashState.pacientesPage = 1;
      pintarDashPacientesBody(body);
    });
  }

  function dashChartPanelHtml(titulo, items, tipo) {
    var max = Math.max.apply(null, items.map(function (x) { return x.value; }).concat([1]));
    var cuerpo = !items.length ? '<div class="empty-state">Sin datos.</div>' :
      (tipo === "donut" ? donutChartHtml(items, { centerText: titulo }) : hbarsHtml(items, max));
    return '<div class="panel" style="flex:1;min-width:260px;"><div class="panel-title">' + escapeHtml(titulo) + "</div>" + cuerpo + "</div>";
  }

  function pintarDashPacientesBody(body) {
    var pacientes = dashCache.pacientes || [];
    body.innerHTML =
      '<div class="stat-grid">' + statCard("Pacientes con casos visibles", pacientes.length) + "</div>" +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;">' +
      dashChartPanelHtml("Por tipo de cáncer", groupCount(pacientes, "Tipo_Cancer").slice(0, 8)) +
      dashChartPanelHtml("Por municipio", groupCount(pacientes, "Municipio").slice(0, 8)) +
      "</div>" +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;">' +
      dashChartPanelHtml("Por EPS", groupCount(pacientes, "Asegurador_EPS").slice(0, 8), "donut") +
      dashChartPanelHtml("Por género", groupCount(pacientes, "Genero").slice(0, 4), "donut") +
      "</div>" +
      '<div class="panel-title" style="margin:18px 0 8px;">Listado de pacientes</div>' +
      '<div class="field" style="max-width:320px;margin-bottom:10px;"><input type="text" id="dash-pac-buscar" placeholder="Buscar por nombre o documento..." /></div>' +
      '<div id="dash-pac-tabla"></div>';

    $("dash-pac-buscar").addEventListener("input", function () { dashState.pacientesQuery = this.value; dashState.pacientesPage = 1; pintarDashPacientesTabla(); });
    pintarDashPacientesTabla();
  }

  function pintarDashPacientesTabla() {
    var cont = $("dash-pac-tabla");
    if (!cont) return;
    var q = (dashState.pacientesQuery || "").trim().toLowerCase();
    var pacientes = (dashCache.pacientes || []).filter(function (p) {
      if (!q) return true;
      return (p.Name || "").toLowerCase().indexOf(q) !== -1 || (p.Numero_Documento || "").toLowerCase().indexOf(q) !== -1;
    });
    var pageSize = 15;
    var totalPages = Math.max(1, Math.ceil(pacientes.length / pageSize));
    if (dashState.pacientesPage > totalPages) dashState.pacientesPage = totalPages;
    var pageItems = pacientes.slice((dashState.pacientesPage - 1) * pageSize, dashState.pacientesPage * pageSize);
    cont.innerHTML = (pacientes.length ? tablaPacientesHtml(pageItems) : '<div class="empty-state">No hay pacientes que coincidan.</div>') +
      dashPaginacionHtml(pacientes.length, dashState.pacientesPage, totalPages, "dash-pac");
    Array.prototype.forEach.call(cont.querySelectorAll("[data-paciente-id]"), function (row) {
      row.addEventListener("click", function () { navigate("detalle_paciente", { id: row.dataset.pacienteId }); });
    });
    var prev = $("dash-pac-prev"); if (prev) prev.addEventListener("click", function () { dashState.pacientesPage--; pintarDashPacientesTabla(); });
    var next = $("dash-pac-next"); if (next) next.addEventListener("click", function () { dashState.pacientesPage++; pintarDashPacientesTabla(); });
  }

  function dashPaginacionHtml(total, page, totalPages, idPrefix) {
    if (totalPages <= 1) return '<div class="dash-paginacion-info">' + total + " registro(s)</div>";
    return '<div class="dash-paginacion">' +
      '<span class="dash-paginacion-info">' + total + " registro(s) · página " + page + " de " + totalPages + "</span>" +
      '<div class="dash-paginacion-btns">' +
      '<button type="button" class="btn btn-sm" id="' + idPrefix + '-prev" ' + (page <= 1 ? "disabled" : "") + ">Anterior</button>" +
      '<button type="button" class="btn btn-sm" id="' + idPrefix + '-next" ' + (page >= totalPages ? "disabled" : "") + ">Siguiente</button>" +
      "</div></div>";
  }

  // ---------- Tab: Ruta oncológica ----------

  function pintarDashRuta(body) {
    if (!Object.keys(ESTADO_A_ETAPA_INDEX).length) buildEstadoAEtapaIndex();
    var base = dashCasosBase();
    var total = base.length || 1;
    var enEtapaActual = {}, superaronEtapa = {};
    TIMELINE_STAGES.forEach(function (_, i) { enEtapaActual[i] = 0; superaronEtapa[i] = 0; });
    base.forEach(function (c) {
      var idx = ESTADO_A_ETAPA_INDEX[c.Estado_Actual];
      if (idx === undefined) return;
      TIMELINE_STAGES.forEach(function (_, i) { if (idx > i) superaronEtapa[i]++; });
      if (TIMELINE_STAGES[idx].estado === c.Estado_Actual) enEtapaActual[idx]++;
    });

    body.innerHTML = '<div class="panel"><div class="panel-title">Avance por etapa de la ruta</div>' +
      '<div class="panel-subtitle">Clic en una etapa para ver esos casos · % sobre ' + total + " caso(s) con los filtros actuales</div>" +
      '<div class="dash-funnel">' +
      TIMELINE_STAGES.map(function (stage, i) {
        var alcanzaron = enEtapaActual[i] + superaronEtapa[i];
        var pct = Math.round((alcanzaron / total) * 100);
        return '<div class="dash-funnel-step" data-etapa="' + stage.estado + '" data-etapa-label="' + escapeHtml(stage.label) + '">' +
          '<div class="dash-funnel-row"><span>' + escapeHtml(stage.label) + "</span><span>" + alcanzaron + " (" + pct + "%) · " + enEtapaActual[i] + " en esta etapa ahora</span></div>" +
          '<div class="dash-funnel-bar-track"><div class="dash-funnel-bar-fill" style="width:' + pct + '%;"></div></div>' +
          "</div>";
      }).join("") +
      "</div></div>";

    Array.prototype.forEach.call(body.querySelectorAll("[data-etapa]"), function (row) {
      row.addEventListener("click", function () {
        var estado = row.dataset.etapa;
        var lista = dashCasosBase().filter(function (c) { return c.Estado_Actual === estado; });
        abrirModalListaCasos(row.dataset.etapaLabel, lista);
      });
    });
  }

  function buildEstadoAEtapaIndex() {
    var m = {};
    m[EST.CASO_REPORTADO] = 0; m[EST.SIN_PRUEBA_ORDENADA] = 0;
    m[EST.PRUEBA_AUTORIZACION_PENDIENTE] = 1;
    m[EST.PRUEBA_AUTORIZADA] = 2; m[EST.PRUEBA_PROGRAMADA] = 2; m[EST.PRUEBA_CONTACTO_CONFIRMADO] = 2;
    m[EST.PRUEBA_REALIZADA] = 3; m[EST.CASO_CERRADO_NO_ONCOLOGICO] = 3; m[EST.SIN_ESPECIALISTA_REQUERIDO] = 3;
    m[EST.VALORACION_AUTORIZACION_PENDIENTE] = 4;
    m[EST.VALORACION_AUTORIZADA] = 5; m[EST.VALORACION_PROGRAMADA] = 5; m[EST.VALORACION_CONTACTO_CONFIRMADO] = 5;
    m[EST.CITA_ESPECIALISTA_REALIZADA] = 6;
    m[EST.MALIGNIDAD_CONFIRMADA] = 7;
    m[EST.TRATAMIENTO_ORDENADO] = 8;
    m[EST.TRATAMIENTO_INICIADO] = 9; m[EST.RECAIDA] = 9; m[EST.CASO_FALLECIDO] = 9; m[EST.CASO_CERRADO] = 9;
    ESTADO_A_ETAPA_INDEX = m;
  }

  // ---------- Tab: Riesgo y alertas ----------

  function pintarDashRiesgo(body) {
    var base = dashCasosBase();
    var idsBase = {}; base.forEach(function (c) { idsBase[c.id] = true; });
    var barrerasPend = app.alertas.filter(function (a) { return a.Estado !== "Atendida" && idsBase[lookupId(a.Caso)]; });
    var atrasados = base.filter(esCasoAtrasado);
    var sinPrueba = base.filter(function (c) { return c.Estado_Actual === EST.SIN_PRUEBA_ORDENADA; });
    var sinEspecialista = base.filter(function (c) { return c.Estado_Actual === EST.SIN_ESPECIALISTA_REQUERIDO; });

    var porTipo = {};
    barrerasPend.forEach(function (a) { var t = a.Tipo_Barrera || "Otro"; porTipo[t] = (porTipo[t] || 0) + 1; });
    var barrerasItems = Object.keys(porTipo).map(function (t) { return { label: barreraLabel(t), value: porTipo[t] }; }).sort(function (a, b) { return b.value - a.value; });
    var maxBarrera = Math.max.apply(null, barrerasItems.map(function (x) { return x.value; }).concat([1]));

    body.innerHTML =
      '<div class="stat-grid">' +
      statCard("Barreras pendientes", barrerasPend.length, barrerasPend.length ? "crit" : "") +
      statCard("Sin actualizar hace +7 días", atrasados.length, atrasados.length ? "crit" : "") +
      statCard("Sin prueba confirmatoria ordenada", sinPrueba.length) +
      statCard("Seguimiento sin especialista", sinEspecialista.length) +
      "</div>" +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;">' +
      '<div class="panel" style="flex:1;min-width:280px;">' +
      '<div class="panel-title">Barreras pendientes por tipo</div>' +
      (barrerasItems.length ? hbarsHtml(barrerasItems, maxBarrera) : '<div class="empty-state">No hay barreras pendientes.</div>') +
      "</div>" +
      '<div class="panel" style="flex:1.2;min-width:300px;">' +
      '<div class="panel-title">Casos que requieren atención</div><div class="panel-subtitle">Sin ninguna actualización hace más de 7 días</div>' +
      (atrasados.length ? '<div class="case-card-list">' + atrasados.slice(0, 6).map(function (c) { return casoCardHtml(c, false); }).join("") + "</div>" : '<div class="empty-state">Todo al día.</div>') +
      (atrasados.length > 6 ? '<button type="button" class="btn btn-sm" style="margin-top:10px;" id="dash-riesgo-vertodos">Ver los ' + atrasados.length + "</button>" : "") +
      "</div></div>";

    Array.prototype.forEach.call(body.querySelectorAll("[data-caso-id]"), function (row) {
      row.addEventListener("click", function () { navigate("detalle_caso", { id: row.dataset.casoId }); });
    });
    var verTodos = $("dash-riesgo-vertodos");
    if (verTodos) verTodos.addEventListener("click", function () { abrirModalListaCasos(dashQuickFilterLabel("atrasados"), atrasados); });
  }

  // ---------- Tab: Gestión ----------

  function pintarDashGestion(body) {
    if (!FEATURES.eventos) {
      body.innerHTML = '<div class="empty-state">Se activa cuando se cree el módulo Onco_Tareas.</div>';
      return;
    }
    body.innerHTML = '<div class="loading-state">Cargando historial de gestión...</div>';
    dashCargarEventos().then(function (pares) {
      var eventos = [];
      pares.forEach(function (p) { eventos = eventos.concat(p.eventos); });
      var pendientesGestion = dashCasosBase().filter(function (c) { return TERMINALES.indexOf(c.Estado_Actual) === -1; }).length;

      var porTipoRaw = {};
      eventos.forEach(function (e) { porTipoRaw[e.Tipo_Evento] = (porTipoRaw[e.Tipo_Evento] || 0) + 1; });
      var porTipo = Object.keys(porTipoRaw).map(function (k) { return { label: eventoLabel(k), value: porTipoRaw[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8);

      var porRolRaw = {};
      eventos.forEach(function (e) { var r = ROLE_LABELS[e.Rol_Registro] || e.Rol_Registro || "Sin dato"; porRolRaw[r] = (porRolRaw[r] || 0) + 1; });
      var porRol = Object.keys(porRolRaw).map(function (k) { return { label: k, value: porRolRaw[k] }; }).sort(function (a, b) { return b.value - a.value; });

      var porResponsableRaw = {};
      eventos.forEach(function (e) { var r = e.Registrado_Por || "Sin dato"; porResponsableRaw[r] = (porResponsableRaw[r] || 0) + 1; });
      var porResponsable = Object.keys(porResponsableRaw).map(function (k) { return { label: k, value: porResponsableRaw[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8);

      var porMes = {};
      eventos.forEach(function (e) { if (!e.Fecha_Evento) return; var d = new Date(e.Fecha_Evento); if (isNaN(d)) return; var key = d.getFullYear() + "-" + pad(d.getMonth() + 1); porMes[key] = (porMes[key] || 0) + 1; });
      var meses = Object.keys(porMes).sort().slice(-6).map(function (k) { return { label: mesLabel(k), value: porMes[k] }; });
      var maxMeses = Math.max.apply(null, meses.map(function (x) { return x.value; }).concat([1]));
      var maxTipo = Math.max.apply(null, porTipo.map(function (x) { return x.value; }).concat([1]));
      var maxResp = Math.max.apply(null, porResponsable.map(function (x) { return x.value; }).concat([1]));

      body.innerHTML =
        '<div class="panel-subtitle" style="margin-bottom:10px;">Sobre los ' + pares.length + ' caso(s) actualizados más recientemente (no el histórico completo)</div>' +
        '<div class="stat-grid">' +
        statCard("Gestiones registradas", eventos.length) +
        statCard("Casos pendientes de gestión", pendientesGestion, pendientesGestion ? "crit" : "") +
        "</div>" +
        '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;">' +
        '<div class="panel" style="flex:1.3;min-width:320px;"><div class="panel-title">Gestiones por mes</div>' +
        (meses.length ? barsChartHtml(meses, maxMeses) : '<div class="empty-state">Sin datos suficientes.</div>') + "</div>" +
        '<div class="panel" style="flex:1;min-width:280px;"><div class="panel-title">Gestiones por rol</div>' +
        (porRol.length ? donutChartHtml(porRol, { centerText: "Gestiones", size: 110 }) : '<div class="empty-state">Sin datos.</div>') + "</div></div>" +
        '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;">' +
        '<div class="panel" style="flex:1;min-width:280px;"><div class="panel-title">Gestiones por tipo de evento</div>' +
        (porTipo.length ? hbarsHtml(porTipo, maxTipo) : '<div class="empty-state">Sin datos.</div>') + "</div>" +
        '<div class="panel" style="flex:1;min-width:280px;"><div class="panel-title">Gestiones por responsable</div>' +
        (porResponsable.length ? hbarsHtml(porResponsable, maxResp) : '<div class="empty-state">Sin datos.</div>') + "</div></div>";
    });
  }

  // ---------- Tab: Indicadores ----------

  function pintarDashIndicadores(body) {
    var base = dashCasosBase();
    var casosAltaIncidencia = base.filter(function (c) { return MUNICIPIOS_ALTA_INCIDENCIA.indexOf(c.Municipio) !== -1; }).length;

    body.innerHTML = '<div class="loading-state">Calculando indicadores...</div>';
    dashCargarEventos().then(function (pares) {
      var confirmados = pares.filter(function (p) { return ESTADOS_DESDE_MALIGNIDAD.indexOf(p.caso.Estado_Actual) !== -1; });
      var oportunidad = [], sospechaTto = [], diagTto = [], estadioCounts = {}, guiaSi = 0, guiaNo = 0;
      confirmados.forEach(function (p) {
        var confirm = p.eventos.find(function (e) { return e.Tipo_Evento === EVT.MALIGNIDAD_CONFIRMADA; });
        var inicioTto = p.eventos.find(function (e) { return e.Tipo_Evento === EVT.TRATAMIENTO_INICIADO; });
        var estadificacion = p.eventos.find(function (e) { return e.Tipo_Evento === EVT.ESTADIFICACION && e.Estadio_Clinico; });
        var ordenTto = p.eventos.find(function (e) { return e.Tipo_Evento === EVT.TRATAMIENTO_ORDENADO && e.Segun_Guia_Manejo; });
        if (confirm) oportunidad.push(diffDias(p.caso.Fecha_de_Reporte, confirm.Fecha_Evento));
        if (inicioTto) sospechaTto.push(diffDias(p.caso.Fecha_de_Reporte, inicioTto.Fecha_Evento));
        if (confirm && inicioTto) diagTto.push(diffDias(confirm.Fecha_Evento, inicioTto.Fecha_Evento));
        if (estadificacion) estadioCounts[estadificacion.Estadio_Clinico] = (estadioCounts[estadificacion.Estadio_Clinico] || 0) + 1;
        if (ordenTto) { if (ordenTto.Segun_Guia_Manejo === "Si") guiaSi++; else if (ordenTto.Segun_Guia_Manejo === "No") guiaNo++; }
      });
      var estadioItems = Object.keys(estadioCounts).map(function (k) { return { label: k, value: estadioCounts[k] }; }).sort(function (a, b) { return b.value - a.value; });
      var totalGuia = guiaSi + guiaNo;
      var guiaItems = totalGuia ? [{ label: "Según guía", value: guiaSi }, { label: "Fuera de guía", value: guiaNo }] : [];

      body.innerHTML =
        '<div class="panel"><div class="panel-title">Oportunidad en el diagnóstico y tratamiento</div>' +
        '<div class="panel-subtitle">Promedio en días, sobre ' + confirmados.length + " caso(s) con malignidad confirmada</div>" +
        '<div class="stat-grid">' +
        statCard("Sospecha → confirmación", promedio(oportunidad) + " días") +
        statCard("Sospecha → inicio de tratamiento", promedio(sospechaTto) + " días") +
        statCard("Confirmación → tratamiento", promedio(diagTto) + " días") +
        statCard("Municipios de alta incidencia", casosAltaIncidencia, "", "Pasto, Linares, Sandoná, El Charco, Tumaco, Ipiales") +
        "</div></div>" +
        '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;">' +
        '<div class="panel" style="flex:1;min-width:260px;"><div class="panel-title">Estadío al diagnóstico</div>' +
        (estadioItems.length ? donutChartHtml(estadioItems, { centerText: "Casos", size: 110 }) : '<div class="empty-state">Sin estadificación registrada.</div>') +
        "</div>" +
        '<div class="panel" style="flex:1;min-width:260px;"><div class="panel-title">Adherencia a guías de manejo</div>' +
        (guiaItems.length ? donutChartHtml(guiaItems, { centerText: "Tratamientos", size: 110 }) : '<div class="empty-state">Sin datos todavía.</div>') +
        "</div></div>";
    });
  }

  // ===================================================================
  // Vista: Alertas (bandeja, comun a todos los roles)
  // ===================================================================

  function renderAlertas() {
    loadAlertasBandeja().then(pintar);
    function pintar() {
      renderShellChrome(); // refresca el contador del sidebar
      els.content.innerHTML = pageHeader("Alertas", app.currentUser.rol === ROLES.ADMIN ? "Todas las barreras reportadas" : "Barreras de acceso enrutadas a ti") +
        '<div class="page-body">' +
        (app.alertas.length ? '<div class="case-card-list">' + app.alertas.map(alertaCardHtml).join("") + "</div>" : '<div class="empty-state">No hay alertas.</div>') +
        "</div>";

      Array.prototype.forEach.call(els.content.querySelectorAll("[data-open-caso]"), function (btn) {
        btn.addEventListener("click", function () { navigate("detalle_caso", { id: btn.dataset.openCaso }); });
      });
      Array.prototype.forEach.call(els.content.querySelectorAll("[data-atender]"), function (btn) {
        btn.addEventListener("click", function () { marcarAlertaAtendida(btn.dataset.atender); });
      });
    }
  }

  // ===================================================================
  // Modal: Notificaciones (bell del topbar) -- mezcla barreras pendientes
  // + cambios recientes de estado en los casos, con un solo clic entras
  // al panel al que pertenece la notificacion (una barrera -> "Alertas";
  // un cambio de caso -> el caso). Distinto de "Alertas" (pestana del
  // sidebar, que solo lista barreras) -- ver seccion 7.1 del README.
  // ===================================================================

  function toggleNotifDropdown() {
    var dropdown = $("notif-dropdown");
    if (!dropdown) return;
    if (!dropdown.hidden) { closeNotifDropdown(); return; }
    renderNotifDropdown();
    dropdown.hidden = false;
    // El listener se agrega en el siguiente tick para que el click que
    // acaba de abrir el dropdown no dispare tambien su propio cierre.
    setTimeout(function () { document.addEventListener("click", onDocClickCloseNotif); }, 0);
  }

  function closeNotifDropdown() {
    var dropdown = $("notif-dropdown");
    if (dropdown) dropdown.hidden = true;
    document.removeEventListener("click", onDocClickCloseNotif);
  }

  function onDocClickCloseNotif(evt) {
    var dropdown = $("notif-dropdown");
    var bell = $("bell-btn");
    if (!dropdown || dropdown.hidden) return;
    if (dropdown.contains(evt.target) || (bell && bell.contains(evt.target))) return;
    closeNotifDropdown();
  }

  function renderNotifDropdown() {
    var barreras = app.alertas.filter(function (a) { return a.Estado !== "Atendida"; })
      .map(function (a) {
        return { ts: a.Fecha_Creacion, html: notifItemBarreraHtml(a) };
      });
    var cambios = casosConCambiosRecientes().slice(0, 20).map(function (c) {
      return { ts: c.Ultima_Actualizacion, html: notifItemCasoHtml(c) };
    });
    var items = barreras.concat(cambios).sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });

    var dropdown = $("notif-dropdown");
    dropdown.innerHTML = '<div class="notif-dropdown-header">Notificaciones</div>' +
      '<div class="notif-list">' +
      (items.length ? items.map(function (it) { return it.html; }).join("") : '<div class="empty-state">No hay notificaciones.</div>') +
      "</div>";

    Array.prototype.forEach.call(dropdown.querySelectorAll("[data-caso-id]"), function (row) {
      row.addEventListener("click", function () { closeNotifDropdown(); navigate("detalle_caso", { id: row.dataset.casoId }); });
    });
    Array.prototype.forEach.call(dropdown.querySelectorAll("[data-go-alertas]"), function (row) {
      row.addEventListener("click", function () { closeNotifDropdown(); navigate("alertas"); });
    });

    // Marca los cambios de caso como "vistos" al abrir el dropdown -- la
    // proxima vez solo cuentan como nuevos los que cambien despues de esto.
    setLastNotifSeenAt(Date.now());
    renderShellChrome();
  }

  // Una barrera de acceso pertenece a la pantalla "Alertas", no a un caso
  // en particular desde aqui -- clic lleva a esa pantalla (ahi ya esta el
  // boton "Ver caso" por cada barrera si hace falta ir mas al detalle).
  function notifItemBarreraHtml(a) {
    return '<div class="notif-item" data-go-alertas="1">' +
      '<div class="notif-item-icon crit">' + icon("warning", 15) + "</div>" +
      '<div class="notif-item-body">' +
      '<div class="notif-item-title">' + escapeHtml(barreraLabel(a.Tipo_Barrera)) + "</div>" +
      '<div class="notif-item-meta">Barrera de acceso · ' + fmtDate(a.Fecha_Creacion) + "</div>" +
      "</div></div>";
  }

  function notifItemCasoHtml(c) {
    return '<div class="notif-item" data-caso-id="' + c.id + '">' +
      '<div class="notif-item-icon brand">' + icon("file", 15) + "</div>" +
      '<div class="notif-item-body">' +
      '<div class="notif-item-title">' + escapeHtml(c.Name || c.Numero_Caso) + " · " + escapeHtml(EST_LABELS[c.Estado_Actual] || c.Estado_Actual) + "</div>" +
      '<div class="notif-item-meta">Actualizado ' + fmtDate(c.Ultima_Actualizacion) + "</div>" +
      "</div></div>";
  }

  function alertaCardHtml(a) {
    var pendiente = a.Estado !== "Atendida";
    return '<div class="case-card" style="cursor:default;">' +
      '<div class="case-card-top"><div>' +
      '<div class="case-card-title">' + escapeHtml(barreraLabel(a.Tipo_Barrera)) + "</div>" +
      '<div class="case-card-sub">Reportada por ' + escapeHtml(a.Disparada_Por) + " · " + fmtDate(a.Fecha_Creacion) + "</div>" +
      "</div>" + pillHtml(pendiente ? { cls: "crit", text: "Pendiente" } : { cls: "good", text: "Atendida" }) + "</div>" +
      (a.Detalle ? '<div class="case-card-footer">' + escapeHtml(a.Detalle) + "</div>" : "") +
      '<div style="display:flex;gap:8px;">' +
      '<button class="btn btn-sm" data-open-caso="' + lookupId(a.Caso) + '">Ver caso</button>' +
      (pendiente ? '<button class="btn btn-sm btn-primary" data-atender="' + a.id + '">Marcar atendida</button>' : "") +
      "</div></div>";
  }

  // ===================================================================
  // Vista: Detalle de caso (compartida entre roles, con panel de accion
  // contextual segun rol + estado actual)
  // ===================================================================

  function renderDetalleCaso(casoId) {
    var caso = findCaso(casoId);
    if (!caso) { navigate(defaultRouteForRole()); return; }
    detalleTabActivo = "resumen";
    els.content.innerHTML = backHeader("Volver") + '<div class="loading-state">Cargando caso...</div>';
    $("back-btn").addEventListener("click", function () { navigate((app.lastListRoute && app.lastListRoute.name) || defaultRouteForRole()); });

    Promise.all([loadPaciente(lookupId(caso.Paciente)), loadEventosDeCaso(casoId), loadAlertasDeCaso(casoId)])
      .then(function (r) { pintarDetalle(caso, r[0], r[1], r[2]); });
  }

  var TIMELINE_STAGES = [
    { estado: EST.CASO_REPORTADO, label: "Caso reportado" },
    { estado: EST.PRUEBA_AUTORIZACION_PENDIENTE, label: "Prueba confirmatoria: autorización" },
    { estado: EST.PRUEBA_AUTORIZADA, label: "Prueba confirmatoria: programación" },
    { estado: EST.PRUEBA_REALIZADA, label: "Prueba confirmatoria: resultado" },
    { estado: EST.VALORACION_AUTORIZACION_PENDIENTE, label: "Especialista: autorización" },
    { estado: EST.VALORACION_AUTORIZADA, label: "Especialista: programación" },
    { estado: EST.CITA_ESPECIALISTA_REALIZADA, label: "Especialista: cita realizada" },
    { estado: EST.MALIGNIDAD_CONFIRMADA, label: "Malignidad confirmada" },
    { estado: EST.TRATAMIENTO_ORDENADO, label: "Tratamiento ordenado" },
    { estado: EST.TRATAMIENTO_INICIADO, label: "Tratamiento iniciado" }
  ];

  // Evento cuya fecha se muestra como la fecha en que se alcanzo cada etapa
  // principal. Las etapas "*_Autorizacion_Pendiente" no tienen evento propio
  // (se entra a ellas automaticamente), asi que quedan sin fecha.
  var STAGE_EVENT_MAP = {};
  STAGE_EVENT_MAP[EST.CASO_REPORTADO] = EVT.REPORTE_INICIAL;
  STAGE_EVENT_MAP[EST.PRUEBA_AUTORIZADA] = EVT.PRUEBA_AUTORIZADA;
  STAGE_EVENT_MAP[EST.PRUEBA_REALIZADA] = EVT.PRUEBA_REALIZADA_RESULTADO;
  STAGE_EVENT_MAP[EST.VALORACION_AUTORIZADA] = EVT.VALORACION_AUTORIZADA;
  STAGE_EVENT_MAP[EST.CITA_ESPECIALISTA_REALIZADA] = EVT.CITA_ESPECIALISTA_REALIZADA;
  STAGE_EVENT_MAP[EST.MALIGNIDAD_CONFIRMADA] = EVT.MALIGNIDAD_CONFIRMADA;
  STAGE_EVENT_MAP[EST.TRATAMIENTO_ORDENADO] = EVT.TRATAMIENTO_ORDENADO;
  STAGE_EVENT_MAP[EST.TRATAMIENTO_INICIADO] = EVT.TRATAMIENTO_INICIADO;

  function ultimoEventoDeTipo(eventos, tipo) {
    for (var i = eventos.length - 1; i >= 0; i--) { if (eventos[i].Tipo_Evento === tipo) return eventos[i]; }
    return null;
  }

  // Cuando el caso esta fuera del camino principal (cerrado, recaida, sin
  // prueba/especialista requerido), no hay una etapa de TIMELINE_STAGES que
  // coincida exactamente con Estado_Actual: se dibuja el avance hasta la
  // ultima etapa principal cuyo evento si quedo registrado.
  function ultimaEtapaPrincipalAlcanzada(eventos) {
    var idx = 0;
    TIMELINE_STAGES.forEach(function (stage, i) {
      var tipo = STAGE_EVENT_MAP[stage.estado];
      if (tipo && ultimoEventoDeTipo(eventos, tipo)) idx = i;
    });
    return idx;
  }

  // Stepper horizontal (izquierda a derecha), con scroll propio si no caben
  // todas las etapas en el ancho disponible.
  function renderRouteTimeline(caso, eventos) {
    var stageIdx = TIMELINE_STAGES.map(function (s) { return s.estado; }).indexOf(caso.Estado_Actual);
    var effectiveIdx = stageIdx === -1 ? ultimaEtapaPrincipalAlcanzada(eventos) : stageIdx;
    var enCaminoPrincipal = stageIdx !== -1;

    return '<div class="route-timeline-h">' + TIMELINE_STAGES.map(function (stage, i) {
      var estadoStep = i < effectiveIdx ? "done" : (i === effectiveIdx && enCaminoPrincipal ? "current" : (i === effectiveIdx ? "done" : "pending"));
      var tipo = STAGE_EVENT_MAP[stage.estado];
      var evento = tipo ? ultimoEventoDeTipo(eventos, tipo) : null;
      var isFirst = i === 0;
      var isLast = i === TIMELINE_STAGES.length - 1;
      var lineBeforeDone = i > 0 && i <= effectiveIdx;
      var lineAfterDone = i < effectiveIdx;
      return '<div class="h-step ' + (estadoStep === "pending" ? "pending" : "") + '">' +
        '<div class="h-connector-row">' +
        '<div class="h-line ' + (isFirst ? "invisible" : (lineBeforeDone ? "done" : "")) + '"></div>' +
        '<div class="h-marker ' + estadoStep + '">' + (estadoStep === "done" ? icon("check", 11) : "") + "</div>" +
        '<div class="h-line ' + (isLast ? "invisible" : (lineAfterDone ? "done" : "")) + '"></div>' +
        "</div>" +
        '<div class="h-body"><div class="t-title' + (estadoStep === "current" ? " current" : "") + '">' + escapeHtml(stage.label) + "</div>" +
        (evento ? '<div class="t-meta">' + fmtDate(evento.Fecha_Evento) + "</div>" : "") +
        "</div></div>";
    }).join("") + "</div>";
  }

  var detalleTabActivo = "resumen"; // "resumen" | "historial"

  function resumenTabHtml(caso, paciente, alertasCaso) {
    var pendientesAlerta = alertasCaso.filter(function (a) { return a.Estado !== "Atendida"; }).length;
    return '<div class="panel">' +
      '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;">' + escapeHtml(caso.Name || caso.Numero_Caso) + "</div>" +
      '<div style="font-size:17px;font-weight:700;margin-top:3px;">' + escapeHtml(paciente ? (paciente.Name || paciente.Nombre_Completo || (paciente.Nombres + " " + paciente.Apellidos)) : "Paciente") +
      (paciente ? " · " + escapeHtml(String(paciente.Edad || "")) + " años · " + escapeHtml(paciente.Genero || "") : "") + "</div>" +
      '<div style="height:1px;background:var(--grid);margin:11px 0;"></div>' +
      '<div style="display:flex;flex-direction:column;gap:7px;font-size:12.5px;">' +
      infoRow("Municipio", caso.Municipio) + infoRow("EPS", caso.Eps_Actual) +
      infoRow("IPS oncológica", caso.Ips_Oncologica_Actual) + infoRow("Sospecha", paciente && paciente.Tipo_Cancer) +
      infoRow("Reportado por", caso.Reportado_Por) +
      "</div></div>" +
      '<div class="panel">' +
      '<div class="panel-title">Estado actual</div>' + pillHtml(pillForEstado(caso.Estado_Actual)) +
      '<div style="font-size:12.5px;color:var(--ink-2);margin-top:8px;">' + escapeHtml(caso.Siguiente_Paso || "") + "</div></div>" +
      (pendientesAlerta ? '<div class="notice-box warn">' + icon("warning") + "<div>" + pendientesAlerta + " alerta(s) de barrera sin atender en este caso.</div></div>" : "");
  }

  function historialTabHtml(caso, eventos) {
    if (!FEATURES.eventos) {
      return '<div class="panel"><div class="panel-title">Cronología</div><div class="empty-state">Se activa cuando se cree el módulo Onco_Tareas.</div></div>';
    }
    return '<div class="panel"><div class="panel-title">Cronología completa</div>' +
      (eventos.length ? eventos.map(eventoLogHtml).join("") : '<div class="empty-state">Sin eventos aún.</div>') + "</div>";
  }

  function pintarDetalle(caso, paciente, eventos, alertasCaso) {
    function renderTimelineFull() {
      var el = $("detalle-timeline-full");
      if (!el) return;
      if (detalleTabActivo === "resumen" && FEATURES.eventos) {
        el.hidden = false;
        el.innerHTML = '<div class="panel-title">Línea de tiempo de la ruta</div>' + renderRouteTimeline(caso, eventos);
      } else {
        el.hidden = true;
        el.innerHTML = "";
      }
    }

    function renderLeftCol() {
      var tabsHtml = '<div class="detalle-tabs">' +
        '<button class="detalle-tab-btn' + (detalleTabActivo === "resumen" ? " active" : "") + '" data-tab="resumen">Resumen</button>' +
        '<button class="detalle-tab-btn' + (detalleTabActivo === "historial" ? " active" : "") + '" data-tab="historial">Historial</button>' +
        "</div>";
      var body = detalleTabActivo === "historial" ? historialTabHtml(caso, eventos) : resumenTabHtml(caso, paciente, alertasCaso);
      $("detalle-left-col").innerHTML = tabsHtml + '<div style="display:flex;flex-direction:column;gap:14px;">' + body + "</div>";
      Array.prototype.forEach.call($("detalle-left-col").querySelectorAll(".detalle-tab-btn"), function (btn) {
        btn.addEventListener("click", function () { detalleTabActivo = btn.dataset.tab; renderLeftCol(); renderTimelineFull(); });
      });
    }

    var right = '<div class="panel">' + accionPanelHtml(caso) + "</div>";

    els.content.innerHTML = backHeader("Volver") +
      '<div class="page-body" style="display:flex;flex-direction:column;gap:14px;">' +
      '<div style="display:flex;gap:20px;flex-wrap:wrap;">' +
      '<div id="detalle-left-col" style="width:340px;flex-shrink:0;min-width:300px;"></div>' +
      '<div style="flex:1;min-width:320px;display:flex;flex-direction:column;gap:14px;">' + right + "</div>" +
      "</div>" +
      '<div id="detalle-timeline-full" class="panel" hidden></div>' +
      "</div>";

    renderLeftCol();
    renderTimelineFull();

    $("back-btn").addEventListener("click", function () { navigate((app.lastListRoute && app.lastListRoute.name) || defaultRouteForRole()); });
    wireAccionPanel(caso);
  }

  function infoRow(label, value) {
    return '<div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">' + escapeHtml(label) + "</span><span>" + escapeHtml(value || "-") + "</span></div>";
  }

  function eventoLogHtml(e) {
    var extra = "";
    if (e.Estadio_Clinico) extra += "Estadio clínico: " + e.Estadio_Clinico + ". ";
    if (e.Segun_Guia_Manejo) extra += "¿Según guía de manejo?: " + e.Segun_Guia_Manejo + ". ";
    return '<div class="event-log-item"><div class="event-log-dot"></div><div class="event-log-body">' +
      '<div class="ev-title">' + escapeHtml(eventoLabel(e.Tipo_Evento)) + "</div>" +
      '<div class="ev-meta">' + fmtDate(e.Fecha_Evento) + " · " + escapeHtml(e.Registrado_Por || "") + "</div>" +
      (extra || e.Comentario ? '<div class="ev-comment">' + escapeHtml(extra) + escapeHtml(e.Comentario || "") + "</div>" : "") +
      "</div></div>";
  }
  function eventoLabel(t) {
    var m = {
      Reporte_Inicial: "Caso reportado", Prueba_Autorizada: "Prueba confirmatoria autorizada", Prueba_Programada: "Prueba confirmatoria programada",
      Prueba_Contacto_Confirmado: "Contacto confirmado", Prueba_Realizada_Resultado: "Resultado de prueba confirmatoria registrado",
      Valoracion_Autorizada: "Valoración con especialista autorizada", Valoracion_Programada: "Cita con especialista programada",
      Valoracion_Contacto_Confirmado: "Contacto confirmado", Cita_Especialista_Realizada: "Cita con especialista realizada",
      Malignidad_Confirmada: "Malignidad confirmada", Estadificacion: "Estadificación registrada",
      Tratamiento_Ordenado: "Tratamiento ordenado", Tratamiento_Iniciado: "Tratamiento iniciado",
      Recaida: "Recaída registrada", Fallecimiento: "Fallecimiento registrado", Cierre_Caso: "Caso cerrado", Comentario: "Comentario"
    };
    return m[t] || t;
  }

  // ---- Panel de accion: decide que formulario mostrar segun rol + estado

  function accionPanelHtml(caso) {
    var rol = app.currentUser.rol;
    var e = caso.Estado_Actual;

    if (TERMINALES.indexOf(e) !== -1) {
      return '<div class="panel-title">Caso cerrado</div><div class="panel-subtitle">' + escapeHtml(EST_LABELS[e]) + (caso.Resultado_Cierre ? " · " + escapeHtml(caso.Resultado_Cierre) : "") + "</div>";
    }

    if (rol === ROLES.LIDER_EPS && (e === EST.PRUEBA_AUTORIZACION_PENDIENTE || e === EST.VALORACION_AUTORIZACION_PENDIENTE)) {
      return '<div class="panel-title">Autorizar ' + (e === EST.PRUEBA_AUTORIZACION_PENDIENTE ? "prueba confirmatoria" : "valoración con especialista") + "</div>" +
        '<div class="panel-subtitle">Define la IPS oncológica de remisión</div>' +
        '<form id="accion-form" class="form-grid">' +
        fieldHtml({ id: "af_ips", label: "IPS oncológica de remisión", type: "select", options: app.picklists.Ips_Oncologica, value: caso.Ips_Oncologica_Actual, required: true }) +
        fieldHtml({ id: "af_fecha", label: "Fecha de autorización", type: "date", value: todayInputValue(), required: true }) +
        fieldHtml({ id: "af_comentario", label: "Comentarios (opcional)", type: "textarea" }) +
        '<button type="submit" class="btn btn-primary btn-block">Autorizar y remitir &rarr;</button></form>';
    }

    if (rol === ROLES.NAVEGADOR_IPS && (e === EST.PRUEBA_AUTORIZADA || e === EST.VALORACION_AUTORIZADA)) {
      return '<div class="panel-title">Programar ' + (e === EST.PRUEBA_AUTORIZADA ? "cita de prueba confirmatoria" : "cita con especialista") + "</div>" +
        '<form id="accion-form" class="form-grid">' +
        '<div class="form-row">' +
        fieldHtml({ id: "af_fecha", label: "Fecha de la cita", type: "date", required: true }) +
        fieldHtml({ id: "af_hora", label: "Hora", type: "time" }) + "</div>" +
        (e === EST.PRUEBA_AUTORIZADA
          ? fieldHtml({ id: "af_tipo", label: "Tipo de prueba", required: true })
          : fieldHtml({ id: "af_tipo", label: "Especialista asignado", required: true })) +
        fieldHtml({ id: "af_nota", label: "Notas para el gestor de la E.S.E. (opcional)", type: "textarea" }) +
        '<button type="submit" class="btn btn-primary btn-block">Confirmar programación &rarr;</button></form>';
    }

    if (rol === ROLES.GESTOR_ESE && (e === EST.PRUEBA_PROGRAMADA || e === EST.VALORACION_PROGRAMADA)) {
      return '<div class="panel-title">Confirmar contacto con la paciente</div>' +
        '<div class="panel-subtitle">Confirma que lograste comunicarte para la cita programada</div>' +
        '<button class="btn btn-primary btn-block" id="accion-simple-btn" data-accion="confirmar_contacto">Confirmar contacto</button>';
    }

    if ((rol === ROLES.GESTOR_ESE || rol === ROLES.NAVEGADOR_IPS) && e === EST.PRUEBA_CONTACTO_CONFIRMADO) {
      return '<div class="panel-title">Registrar realización y resultado de la prueba confirmatoria</div>' +
        '<form id="accion-form" class="form-grid">' +
        fieldHtml({ id: "af_fecha", label: "Fecha de realización", type: "date", required: true }) +
        '<div class="field"><label>¿Resultado sugestivo de cáncer?</label><div class="toggle-pair" id="resultado-toggle">' +
        '<div class="toggle-opt" data-value="Si">Sí</div><div class="toggle-opt" data-value="No">No</div></div></div>' +
        '<div id="resultado-condicional"></div>' +
        '<button type="submit" class="btn btn-primary btn-block">Guardar resultado</button></form>';
    }

    if ((rol === ROLES.GESTOR_ESE || rol === ROLES.NAVEGADOR_IPS) && e === EST.VALORACION_CONTACTO_CONFIRMADO) {
      return '<div class="panel-title">Registrar cita con especialista realizada</div>' +
        '<form id="accion-form" class="form-grid">' +
        fieldHtml({ id: "af_fecha", label: "Fecha de la cita", type: "date", required: true }) +
        '<button type="submit" class="btn btn-primary btn-block">Guardar</button></form>';
    }

    if (rol === ROLES.NAVEGADOR_IPS && e === EST.CITA_ESPECIALISTA_REALIZADA) {
      return '<div class="panel-title">Confirmar malignidad</div>' +
        '<form id="accion-form" class="form-grid">' +
        fieldHtml({ id: "af_fecha", label: "Fecha de confirmación", type: "date", required: true }) +
        fieldHtml({ id: "af_resultado", label: "Resultado del patólogo (biopsia/aspirado/citometría)", type: "textarea", required: true }) +
        '<button type="submit" class="btn btn-primary btn-block">Confirmar malignidad</button></form>';
    }

    if (rol === ROLES.NAVEGADOR_IPS && e === EST.MALIGNIDAD_CONFIRMADA) {
      return '<div class="panel-title">Estadificación (opcional)</div>' +
        '<form id="estadificacion-form" class="form-grid" style="margin-bottom:18px;">' +
        fieldHtml({ id: "ef_estadio", label: "Estadio clínico", type: "select", options: ESTADIOS_CLINICOS, placeholder: "Selecciona un estadio" }) +
        fieldHtml({ id: "ef_detalle", label: "Subcategorización / detalle (opcional)", placeholder: "Ej. T2N1M0" }) +
        '<button type="submit" class="btn btn-sm">Registrar estadificación</button></form>' +
        '<div style="height:1px;background:var(--grid);margin-bottom:16px;"></div>' +
        '<div class="panel-title">Ordenar tratamiento</div>' +
        '<form id="accion-form" class="form-grid">' +
        fieldHtml({ id: "af_tipo_tratamiento", label: "Tipo de tratamiento", required: true }) +
        fieldHtml({ id: "af_ips_continuidad", label: "IPS de continuidad", type: "select", options: app.picklists.Ips_Oncologica, value: caso.Ips_Oncologica_Actual, required: true }) +
        '<div class="field"><label>¿El tratamiento sigue guía de manejo oncológico vigente?</label><div class="toggle-pair" id="guia-manejo-toggle">' +
        '<div class="toggle-opt" data-value="Si">Sí</div><div class="toggle-opt" data-value="No">No</div></div></div>' +
        '<button type="submit" class="btn btn-primary btn-block">Ordenar tratamiento</button></form>';
    }

    if (rol === ROLES.NAVEGADOR_IPS && e === EST.TRATAMIENTO_ORDENADO) {
      return '<div class="panel-title">Registrar inicio de tratamiento</div>' +
        '<form id="accion-form" class="form-grid">' +
        fieldHtml({ id: "af_fecha", label: "Fecha de inicio", type: "date", required: true }) +
        '<button type="submit" class="btn btn-primary btn-block">Registrar inicio</button></form>';
    }

    if ((rol === ROLES.NAVEGADOR_IPS || rol === ROLES.GESTOR_ESE) && (e === EST.TRATAMIENTO_INICIADO || e === EST.RECAIDA)) {
      return seguimientoTratamientoHtml(caso, e);
    }

    if (rol === ROLES.GESTOR_ESE && e === EST.SIN_PRUEBA_ORDENADA) {
      return '<div class="panel-title">Sin prueba confirmatoria ordenada</div>' +
        '<div class="panel-subtitle">Estado de seguimiento manual (ver README, supuesto 6.1)</div>' +
        '<button class="btn btn-primary btn-block" id="accion-simple-btn" data-accion="marcar_prueba_ordenada" style="margin-bottom:10px;">Ya se ordenó la prueba</button>' +
        cierreManualFormHtml();
    }

    if ((rol === ROLES.GESTOR_ESE || rol === ROLES.NAVEGADOR_IPS) && e === EST.SIN_ESPECIALISTA_REQUERIDO) {
      return '<div class="panel-title">Seguimiento sin especialista</div>' +
        '<div class="panel-subtitle">Estado de seguimiento manual (ver README, supuesto 6.2)</div>' +
        '<button class="btn btn-primary btn-block" id="accion-simple-btn" data-accion="reactivar_especialista" style="margin-bottom:10px;">Ahora sí requiere especialista</button>' +
        cierreManualFormHtml();
    }

    return '<div class="panel-subtitle">No hay una acción pendiente para tu rol en este momento.</div>';
  }

  function seguimientoTratamientoHtml(caso, e) {
    return '<div class="panel-title">Seguimiento en tratamiento</div>' +
      '<form id="comentario-form" class="form-grid" style="margin-bottom:16px;">' +
      fieldHtml({ id: "cf_texto", label: "Agregar comentario clínico" }) +
      '<button type="submit" class="btn btn-sm">Agregar comentario</button></form>' +
      '<div style="height:1px;background:var(--grid);margin-bottom:16px;"></div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
      '<button class="btn" id="btn-abrir-recaida">Registrar recaída</button>' +
      '<button class="btn" id="btn-abrir-fallecimiento">Registrar fallecimiento</button>' +
      '<button class="btn btn-danger-soft" id="btn-abrir-cierre">Cerrar caso</button>' +
      "</div>";
  }

  function cierreManualFormHtml() {
    return '<div style="height:1px;background:var(--grid);margin:14px 0;"></div>' +
      '<div class="panel-title" style="font-size:12.5px;">O cerrar el caso manualmente</div>' +
      '<form id="cierre-form" class="form-grid">' +
      fieldHtml({ id: "cf_nota", label: "Motivo del cierre", type: "textarea", required: true }) +
      '<button type="submit" class="btn btn-danger-soft btn-block">Cerrar caso (Otro)</button></form>';
  }

  function wireAccionPanel(caso) {
    var e = caso.Estado_Actual;
    var rol = app.currentUser.rol;

    // Boton "Reportar barrera" siempre disponible en casos no terminales
    // (se agrega al final del panel izquierdo), mientras exista el modulo
    // Onco_Alertas.
    if (FEATURES.alertas && TERMINALES.indexOf(e) === -1) {
      var barraAcciones = document.createElement("div");
      barraAcciones.style.display = "flex";
      barraAcciones.style.gap = "10px";
      barraAcciones.innerHTML = '<button class="btn btn-danger-soft" id="btn-reportar-barrera" style="flex:1;">' + icon("warning") + " Reportar barrera</button>";
      els.content.querySelector(".page-body > div:first-child").appendChild(barraAcciones);
      $("btn-reportar-barrera").addEventListener("click", function () { abrirModalReportarBarrera(caso); });
    }

    var simpleBtn = $("accion-simple-btn");
    if (simpleBtn) {
      simpleBtn.addEventListener("click", function () { ejecutarAccionSimple(caso, simpleBtn.dataset.accion); });
    }

    var estadificacionForm = $("estadificacion-form");
    if (estadificacionForm) {
      estadificacionForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        setBusy(true);
        registrarEvento(caso.id, EVT.ESTADIFICACION, { Estadio_Clinico: val("ef_estadio"), Comentario: val("ef_detalle") })
          .then(function () { toast("Estadificación registrada."); return loadCasos(); })
          .then(function () { renderDetalleCaso(caso.id); })
          .catch(function (err) { toast(err.message); })
          .then(function () { setBusy(false); });
      });
    }

    var resultadoToggle = $("resultado-toggle");
    if (resultadoToggle) {
      Array.prototype.forEach.call(resultadoToggle.querySelectorAll(".toggle-opt"), function (opt) {
        opt.addEventListener("click", function () {
          Array.prototype.forEach.call(resultadoToggle.querySelectorAll(".toggle-opt"), function (o) { o.classList.remove("active"); });
          opt.classList.add("active");
          var cond = $("resultado-condicional");
          if (opt.dataset.value === "No") {
            cond.innerHTML = fieldHtml({ id: "af_diagnostico_alt", label: "Diagnóstico alternativo", required: true });
          } else {
            cond.innerHTML = '<div class="field"><label>¿Requiere valoración con especialista?</label><div class="toggle-pair" id="especialista-toggle">' +
              '<div class="toggle-opt" data-value="Si">Sí</div><div class="toggle-opt" data-value="No">No</div></div></div>' +
              '<div id="especialista-condicional"></div>';
            wireEspecialistaToggle();
          }
        });
      });
    }
    function wireEspecialistaToggle() {
      var t = $("especialista-toggle");
      Array.prototype.forEach.call(t.querySelectorAll(".toggle-opt"), function (opt) {
        opt.addEventListener("click", function () {
          Array.prototype.forEach.call(t.querySelectorAll(".toggle-opt"), function (o) { o.classList.remove("active"); });
          opt.classList.add("active");
          $("especialista-condicional").innerHTML = opt.dataset.value === "Si" ? fieldHtml({ id: "af_tipo_especialidad", label: "Tipo de especialidad", required: true }) : "";
        });
      });
    }

    var guiaManejoToggle = $("guia-manejo-toggle");
    if (guiaManejoToggle) {
      Array.prototype.forEach.call(guiaManejoToggle.querySelectorAll(".toggle-opt"), function (opt) {
        opt.addEventListener("click", function () {
          Array.prototype.forEach.call(guiaManejoToggle.querySelectorAll(".toggle-opt"), function (o) { o.classList.remove("active"); });
          opt.classList.add("active");
        });
      });
    }

    var accionForm = $("accion-form");
    if (accionForm) {
      accionForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        manejarSubmitAccion(caso, e, rol);
      });
    }

    var comentarioForm = $("comentario-form");
    if (comentarioForm) {
      comentarioForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        var texto = val("cf_texto");
        if (!texto) return;
        setBusy(true);
        registrarEvento(caso.id, EVT.COMENTARIO, { Comentario: texto })
          .then(function () { toast("Comentario agregado."); return loadCasos(); })
          .then(function () { renderDetalleCaso(caso.id); })
          .catch(function (err) { toast(err.message); })
          .then(function () { setBusy(false); });
      });
    }

    var cierreForm = $("cierre-form");
    if (cierreForm) {
      cierreForm.addEventListener("submit", function (evt) {
        evt.preventDefault();
        ejecutarTransicion(caso, EVT.CIERRE_CASO, { Resultado_Cierre: "Otro", Comentario: val("cf_nota") }, { Estado_Actual: EST.CASO_CERRADO, Resultado_Cierre: "Otro", Siguiente_Paso: siguientePasoTexto(EST.CASO_CERRADO) });
      });
    }

    var btnRecaida = $("btn-abrir-recaida");
    if (btnRecaida) btnRecaida.addEventListener("click", function () { abrirModalRecaida(caso); });
    var btnFallecimiento = $("btn-abrir-fallecimiento");
    if (btnFallecimiento) btnFallecimiento.addEventListener("click", function () { abrirModalFallecimiento(caso); });
    var btnCierre = $("btn-abrir-cierre");
    if (btnCierre) btnCierre.addEventListener("click", function () { abrirModalCierre(caso); });
  }

  function ejecutarAccionSimple(caso, accion) {
    if (accion === "confirmar_contacto") {
      var nuevoEstado = caso.Estado_Actual === EST.PRUEBA_PROGRAMADA ? EST.PRUEBA_CONTACTO_CONFIRMADO : EST.VALORACION_CONTACTO_CONFIRMADO;
      var tipoEvt = caso.Estado_Actual === EST.PRUEBA_PROGRAMADA ? EVT.PRUEBA_CONTACTO_CONFIRMADO : EVT.VALORACION_CONTACTO_CONFIRMADO;
      ejecutarTransicion(caso, tipoEvt, {}, { Estado_Actual: nuevoEstado, Siguiente_Paso: siguientePasoTexto(nuevoEstado) });
    } else if (accion === "marcar_prueba_ordenada") {
      ejecutarTransicion(caso, EVT.COMENTARIO, { Comentario: "Se confirmó orden de prueba confirmatoria." }, { Estado_Actual: EST.PRUEBA_AUTORIZACION_PENDIENTE, Siguiente_Paso: siguientePasoTexto(EST.PRUEBA_AUTORIZACION_PENDIENTE) });
    } else if (accion === "reactivar_especialista") {
      ejecutarTransicion(caso, EVT.COMENTARIO, { Comentario: "Se reactivó la necesidad de valoración con especialista." }, { Estado_Actual: EST.VALORACION_AUTORIZACION_PENDIENTE, Siguiente_Paso: siguientePasoTexto(EST.VALORACION_AUTORIZACION_PENDIENTE) });
    }
  }

  function manejarSubmitAccion(caso, e, rol) {
    if (rol === ROLES.LIDER_EPS && (e === EST.PRUEBA_AUTORIZACION_PENDIENTE || e === EST.VALORACION_AUTORIZACION_PENDIENTE)) {
      var nuevo = e === EST.PRUEBA_AUTORIZACION_PENDIENTE ? EST.PRUEBA_AUTORIZADA : EST.VALORACION_AUTORIZADA;
      var evtTipo = e === EST.PRUEBA_AUTORIZACION_PENDIENTE ? EVT.PRUEBA_AUTORIZADA : EVT.VALORACION_AUTORIZADA;
      ejecutarTransicion(caso,
        evtTipo, { Fecha_Evento: dateInputToEventDateTime("af_fecha"), Ips_Oncologica: val("af_ips"), Comentario: val("af_comentario") },
        { Estado_Actual: nuevo, Ips_Oncologica_Actual: val("af_ips"), Siguiente_Paso: siguientePasoTexto(nuevo) });
      return;
    }
    if (rol === ROLES.NAVEGADOR_IPS && (e === EST.PRUEBA_AUTORIZADA || e === EST.VALORACION_AUTORIZADA)) {
      var nuevo2 = e === EST.PRUEBA_AUTORIZADA ? EST.PRUEBA_PROGRAMADA : EST.VALORACION_PROGRAMADA;
      var evtTipo2 = e === EST.PRUEBA_AUTORIZADA ? EVT.PRUEBA_PROGRAMADA : EVT.VALORACION_PROGRAMADA;
      var horaTexto = val("af_hora") ? " · Hora: " + val("af_hora") : "";
      var campos = { Fecha_Evento: dateInputToEventDateTime("af_fecha"), Comentario: (val("af_nota") + horaTexto).trim() };
      if (e === EST.PRUEBA_AUTORIZADA) campos.Tipo_Especialidad = val("af_tipo"); else campos.Especialista = val("af_tipo");
      ejecutarTransicion(caso, evtTipo2, campos, { Estado_Actual: nuevo2, Siguiente_Paso: siguientePasoTexto(nuevo2) });
      return;
    }
    if (e === EST.PRUEBA_CONTACTO_CONFIRMADO) {
      var resultado = document.querySelector("#resultado-toggle .toggle-opt.active");
      if (!resultado) { toast("Indica si el resultado fue sugestivo de cáncer."); return; }
      if (resultado.dataset.value === "No") {
        ejecutarTransicion(caso, EVT.PRUEBA_REALIZADA_RESULTADO,
          { Fecha_Evento: dateInputToEventDateTime("af_fecha"), Resultado_Sugestivo: "No", Diagnostico_Alternativo: val("af_diagnostico_alt") },
          { Estado_Actual: EST.CASO_CERRADO_NO_ONCOLOGICO, Siguiente_Paso: siguientePasoTexto(EST.CASO_CERRADO_NO_ONCOLOGICO) });
      } else {
        var reqEsp = document.querySelector("#especialista-toggle .toggle-opt.active");
        if (!reqEsp) { toast("Indica si requiere especialista."); return; }
        var nuevoEstado = reqEsp.dataset.value === "Si" ? EST.VALORACION_AUTORIZACION_PENDIENTE : EST.SIN_ESPECIALISTA_REQUERIDO;
        ejecutarTransicion(caso, EVT.PRUEBA_REALIZADA_RESULTADO,
          { Fecha_Evento: dateInputToEventDateTime("af_fecha"), Resultado_Sugestivo: "Si", Requiere_Especialista: reqEsp.dataset.value, Tipo_Especialidad: val("af_tipo_especialidad") },
          { Estado_Actual: nuevoEstado, Siguiente_Paso: siguientePasoTexto(nuevoEstado) });
      }
      return;
    }
    if (e === EST.VALORACION_CONTACTO_CONFIRMADO) {
      ejecutarTransicion(caso, EVT.CITA_ESPECIALISTA_REALIZADA, { Fecha_Evento: dateInputToEventDateTime("af_fecha") },
        { Estado_Actual: EST.CITA_ESPECIALISTA_REALIZADA, Siguiente_Paso: siguientePasoTexto(EST.CITA_ESPECIALISTA_REALIZADA) });
      return;
    }
    if (rol === ROLES.NAVEGADOR_IPS && e === EST.CITA_ESPECIALISTA_REALIZADA) {
      ejecutarTransicion(caso, EVT.MALIGNIDAD_CONFIRMADA, { Fecha_Evento: dateInputToEventDateTime("af_fecha"), Comentario: val("af_resultado") },
        { Estado_Actual: EST.MALIGNIDAD_CONFIRMADA, Siguiente_Paso: siguientePasoTexto(EST.MALIGNIDAD_CONFIRMADA) });
      return;
    }
    if (rol === ROLES.NAVEGADOR_IPS && (e === EST.MALIGNIDAD_CONFIRMADA || e === EST.RECAIDA)) {
      var ipsCont = val("af_ips_continuidad");
      var guia = document.querySelector("#guia-manejo-toggle .toggle-opt.active");
      ejecutarTransicion(caso, EVT.TRATAMIENTO_ORDENADO, { Tipo_Tratamiento: val("af_tipo_tratamiento"), Ips_Continuidad: ipsCont, Segun_Guia_Manejo: guia ? guia.dataset.value : "" },
        { Estado_Actual: EST.TRATAMIENTO_ORDENADO, Ips_Oncologica_Actual: ipsCont, Siguiente_Paso: siguientePasoTexto(EST.TRATAMIENTO_ORDENADO) });
      return;
    }
    if (rol === ROLES.NAVEGADOR_IPS && e === EST.TRATAMIENTO_ORDENADO) {
      ejecutarTransicion(caso, EVT.TRATAMIENTO_INICIADO, { Fecha_Evento: dateInputToEventDateTime("af_fecha") },
        { Estado_Actual: EST.TRATAMIENTO_INICIADO, Siguiente_Paso: siguientePasoTexto(EST.TRATAMIENTO_INICIADO) });
      return;
    }
  }

  // ---- Modales de acciones desde "En tratamiento"

  function abrirModalRecaida(caso) {
    openModal('<div class="modal-card"><div class="modal-header"><h2>Registrar recaída</h2><button class="btn-icon" id="modal-close">' + icon("close") + "</button></div>" +
      '<form id="modal-form" class="form-grid">' + fieldHtml({ id: "mf_fecha", label: "Fecha de recaída", type: "date", required: true }) +
      '<button type="submit" class="btn btn-primary btn-block">Registrar</button></form></div>');
    $("modal-close").addEventListener("click", closeModal);
    $("modal-form").addEventListener("submit", function (evt) {
      evt.preventDefault();
      ejecutarTransicion(caso, EVT.RECAIDA, { Fecha_Evento: dateInputToEventDateTime("mf_fecha") }, { Estado_Actual: EST.RECAIDA, Siguiente_Paso: siguientePasoTexto(EST.RECAIDA) })
        .then(closeModal);
    });
  }

  function abrirModalFallecimiento(caso) {
    openModal('<div class="modal-card"><div class="modal-header"><h2>Registrar fallecimiento</h2><button class="btn-icon" id="modal-close">' + icon("close") + "</button></div>" +
      '<form id="modal-form" class="form-grid">' + fieldHtml({ id: "mf_fecha", label: "Fecha de fallecimiento", type: "date", required: true }) +
      '<button type="submit" class="btn btn-danger btn-block">Registrar</button></form></div>');
    $("modal-close").addEventListener("click", closeModal);
    $("modal-form").addEventListener("submit", function (evt) {
      evt.preventDefault();
      ejecutarTransicion(caso, EVT.FALLECIMIENTO, { Fecha_Evento: dateInputToEventDateTime("mf_fecha") },
        { Estado_Actual: EST.CASO_FALLECIDO, Resultado_Cierre: "Fallecido", Siguiente_Paso: siguientePasoTexto(EST.CASO_FALLECIDO) })
        .then(closeModal);
    });
  }

  function abrirModalCierre(caso) {
    openModal('<div class="modal-card"><div class="modal-header"><h2>Cerrar caso</h2><button class="btn-icon" id="modal-close">' + icon("close") + "</button></div>" +
      '<form id="modal-form" class="form-grid">' +
      // El valor real de este picklist en la organizacion actual de Zoho
      // quedo "Curado Remision" (con espacio), no "Curado_Remision" --
      // confirmado via /campos; mandar el guion bajo da INVALID_DATA.
      fieldHtml({ id: "mf_resultado", label: "Resultado de cierre", type: "select", options: ["Curado Remision", "Traslado", "Abandono", "Otro"], required: true }) +
      fieldHtml({ id: "mf_nota", label: "Nota", type: "textarea" }) +
      '<button type="submit" class="btn btn-danger-soft btn-block">Cerrar caso</button></form></div>');
    $("modal-close").addEventListener("click", closeModal);
    $("modal-form").addEventListener("submit", function (evt) {
      evt.preventDefault();
      var resultado = val("mf_resultado");
      ejecutarTransicion(caso, EVT.CIERRE_CASO, { Resultado_Cierre: resultado, Comentario: val("mf_nota") },
        { Estado_Actual: EST.CASO_CERRADO, Resultado_Cierre: resultado, Siguiente_Paso: siguientePasoTexto(EST.CASO_CERRADO) })
        .then(closeModal);
    });
  }

  function abrirModalReportarBarrera(caso) {
    openModal('<div class="modal-card modal-wide"><div class="modal-header"><h2>Reportar barrera de acceso</h2><button class="btn-icon" id="modal-close">' + icon("close") + "</button></div>" +
      '<div style="font-size:12.5px;color:var(--ink-2);margin-bottom:12px;">' + escapeHtml(caso.Name || caso.Numero_Caso) + "</div>" +
      '<form id="modal-form" class="form-grid">' +
      '<div class="field"><label>Tipo de barrera</label>' +
      BARRERAS.map(function (b) {
        return '<div class="chip-radio-option" data-value="' + b.value + '"><span>' + escapeHtml(b.label) + '</span><span class="radio-dot"></span></div>';
      }).join("") + "</div>" +
      '<div id="barrera-condicional"></div>' +
      fieldHtml({ id: "bf_detalle", label: "Detalles adicionales (opcional)", type: "textarea" }) +
      '<div id="barrera-notice" class="notice-box brand" hidden></div>' +
      '<button type="submit" class="btn btn-danger btn-block">' + icon("send") + " Enviar alerta</button></form></div>");

    $("modal-close").addEventListener("click", closeModal);
    var selected = null;
    Array.prototype.forEach.call(document.querySelectorAll(".chip-radio-option"), function (opt) {
      opt.addEventListener("click", function () {
        Array.prototype.forEach.call(document.querySelectorAll(".chip-radio-option"), function (o) { o.classList.remove("active"); });
        opt.classList.add("active");
        selected = BARRERAS.find(function (b) { return b.value === opt.dataset.value; });
        pintarCondicional();
      });
    });
    function pintarCondicional() {
      var cond = $("barrera-condicional");
      var notice = $("barrera-notice");
      if (!selected) { cond.innerHTML = ""; notice.hidden = true; return; }
      if (selected.needs === "ips") {
        cond.innerHTML = fieldHtml({ id: "bf_ips", label: "¿En cuál IPS oncológica sigue el tratamiento?", type: "select", options: app.picklists.Ips_Oncologica, value: caso.Ips_Oncologica_Actual, required: true });
        notice.hidden = false;
        notice.innerHTML = icon("warning") + "<div>Se notificará al Navegador de esa IPS oncológica.</div>";
      } else {
        cond.innerHTML = "";
        notice.hidden = false;
        var destino = resolverDestinatarioBarrera(selected, caso, {});
        notice.innerHTML = icon("warning") + "<div>Se notificará a: <strong>" + escapeHtml(ROLE_LABELS[destino.rol]) + (destino.institucion ? " · " + escapeHtml(destino.institucion) : "") + "</strong></div>";
      }
    }
    $("modal-form").addEventListener("submit", function (evt) {
      evt.preventDefault();
      if (!selected) { toast("Selecciona el tipo de barrera."); return; }
      submitReportarBarrera(caso, { tipoBarrera: selected.value, ips: val("bf_ips"), detalle: val("bf_detalle") });
    });
  }

  // ===================================================================
  // Registro de rutas
  // ===================================================================

  ROUTES.gestor_mis_casos = renderMisCasos;
  ROUTES.lider_bandeja = renderBandejaLiderEPS;
  ROUTES.lider_historial = renderHistorialLiderEPS;
  ROUTES.nav_agenda = renderAgendaNavegador;
  ROUTES.pacientes = renderListaPacientes;
  ROUTES.detalle_paciente = function (params) { renderDetallePaciente(params.id); };
  ROUTES.admin_dashboard = renderDashboardAdmin;
  ROUTES.alertas = renderAlertas;
  ROUTES.detalle_caso = function (params) { renderDetalleCaso(params.id); };

  // ===================================================================
  // Arranque
  // ===================================================================

  // Sondea si un modulo existe intentando leer sus metadatos — mas barato
  // que una busqueda real y no depende de que ningun campo/criterio en
  // particular ya este creado.
  // Usa el mismo camino que el resto de la app (proxy de Catalyst), no el
  // SDK directo -- Onco_Tareas/Onco_Alertas no estan (ni necesitan estar)
  // compartidos con el portal, asi que una llamada SDK directa fallaria
  // aunque el modulo si exista.
  function probeModuleExists(moduleName) {
    var criteria;
    if (moduleName === MODULES.EVENTOS) criteria = inClause("Tipo_Evento", Object.keys(EVT).map(function (k) { return EVT[k]; }));
    else if (moduleName === MODULES.ALERTAS) criteria = inClause("Estado", ["Pendiente", "Atendida"]);
    else return Promise.resolve(false);
    return zSearch(moduleName, criteria).then(function () { return true; }).catch(function () { return false; });
  }

  function renderSetupBanner() {
    var banner = $("setup-banner");
    var faltantes = [];
    if (!FEATURES.eventos) faltantes.push(MODULES.EVENTOS);
    if (!FEATURES.alertas) faltantes.push(MODULES.ALERTAS);

    var lineas = [];
    if (faltantes.length) {
      lineas.push("Módulo(s) pendiente(s) por crear: <strong>" + faltantes.join(", ") +
        "</strong>. Mientras tanto, el historial de eventos y las alertas quedan desactivados.");
    }
    app.setupWarnings.forEach(function (w) { lineas.push(escapeHtml(w)); });

    if (!lineas.length) { banner.hidden = true; return; }
    banner.hidden = false;
    banner.innerHTML = icon("warning", 15) + "<div>" + lineas.join("<br/>") + "</div>";
  }

  // Buscador del topbar: hoy solo filtra la lista de Pacientes cuando esa
  // es la vista activa (es el unico buscador de esa vista, ver
  // pintarListaPacientes). Se puede ampliar despues a casos/municipio si
  // se pide -- el placeholder ya lo anuncia ("Buscar paciente, caso o
  // municipio..."), pero por ahora solo "paciente" esta conectado.
  function wireGlobalSearch() {
    var input = $("global-search");
    if (!input) return;
    input.addEventListener("input", function () {
      if (app.route.name !== "pacientes") return;
      var q = this.value.trim().toLowerCase();
      var base = app.pacientesLista || [];
      var filtrados = !q ? base : base.filter(function (p) {
        return (p.Name || "").toLowerCase().indexOf(q) !== -1 ||
          (p.Numero_Documento || "").toLowerCase().indexOf(q) !== -1 ||
          (p.Municipio || "").toLowerCase().indexOf(q) !== -1;
      });
      pintarListaPacientes(filtrados);
    });
  }

  function bootAfterIdentify() {
    els.sidebar = $("sidebar");
    els.content = $("content");
    els.bottomNav = $("bottom-nav");
    $("bell-btn").addEventListener("click", function (evt) { evt.stopPropagation(); toggleNotifDropdown(); });
    wireGlobalSearch();

    Promise.all([probeModuleExists(MODULES.EVENTOS), probeModuleExists(MODULES.ALERTAS)])
      .then(function (flags) {
        FEATURES.eventos = flags[0];
        FEATURES.alertas = flags[1];
        return Promise.all([loadPicklists(), loadCasos(), loadAlertasBandeja()]);
      }).then(function () {
        $("loading-screen").hidden = true;
        $("app-shell").hidden = false;
        renderShellChrome();
        renderSetupBanner();
        navigate(defaultRouteForRole());
      }).catch(function (err) {
        var msg = (err && err.message) || String(err);
        if (err && err.ownMessage) {
          // Errores propios (ver loadCasos / zSearch): ya traen el mensaje
          // completo, no hace falta agregarle nada encima.
          $("loading-screen").textContent = msg;
          return;
        }
        $("loading-screen").textContent = "Error al cargar " + MODULES.CASOS + ": " + msg +
          " — revisa las variables de entorno (ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN) del proyecto de Catalyst y que el dominio de tu portal esté en ALLOWED_ORIGIN_SUFFIXES (ver ruta-oncologica-catalyst/README.md).";
      });
  }

  // Restringe cualquier <input type="tel"> de toda la app a solo digitos --
  // un solo listener delegado en vez de repetirlo en cada formulario.
  document.addEventListener("input", function (evt) {
    if (evt.target && evt.target.tagName === "INPUT" && evt.target.type === "tel") {
      var digits = evt.target.value.replace(/[^0-9]/g, "");
      if (digits !== evt.target.value) evt.target.value = digits;
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    // No basta con mirar si hay un iframe (window.self !== window.top):
    // Zoho SIEMPRE embebe el widget en uno, pero tambien lo hacen otros
    // visores (ej. un Artifact de Claude usado para compartir el demo), asi
    // que ese chequeo por si solo confundiria "no es Zoho" con "es Zoho".
    // En cambio: si el SDK real de Zoho no responde con el handshake de
    // ZOHO.embeddedApp.init() en un tiempo razonable, se asume que no
    // estamos dentro de un Client Portal de verdad y se entra a modo local
    // -- funciona igual en Zoho real, en una pestaña suelta, o embebido en
    // cualquier otro visor.
    var yaDecidido = false;
    function entrarModoLocal() {
      if (yaDecidido) return;
      yaDecidido = true;
      iniciarModoLocal();
    }
    function intentarZoho() {
      // yaDecidido se marca solo cuando init() realmente resuelve o falla --
      // marcarlo antes (al solo intentarlo) inutilizaria el timeout de mas
      // abajo, que existe justo para el caso en que init() se queda colgado
      // para siempre sin resolver ni rechazar.
      ZOHO.embeddedApp.on("PageLoad", function () {});
      ZOHO.embeddedApp.init().then(function () {
        if (yaDecidido) return;
        yaDecidido = true;
        identifyUser().then(function (ok) { if (ok) bootAfterIdentify(); });
      }).catch(function (err) {
        if (yaDecidido) return;
        yaDecidido = true;
        $("loading-screen").textContent = "No se pudo inicializar el widget: " + (err && err.message ? err.message : err);
      });
    }
    if (window.ZOHO && window.ZOHO.embeddedApp) {
      intentarZoho();
    } else {
      entrarModoLocal();
    }
    // Red de seguridad: si ZOHO.embeddedApp existe (el script cargo bien)
    // pero su init() nunca resuelve porque no hay un portal real del otro
    // lado, esto fuerza el modo local pasado un rato en vez de dejar la
    // pantalla de carga colgada para siempre. 3s de margen (no 1-2s) para no
    // arriesgar un falso positivo con un Client Portal real en una conexion
    // lenta -- preferible un demo que tarda un poco mas en entrar, que un
    // usuario real de Zoho que cae al modo local por error.
    setTimeout(entrarModoLocal, 3000);
  });
})();
