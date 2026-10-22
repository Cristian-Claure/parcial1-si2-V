// Datos de las tres tiendas nuevas de la plataforma Trama (Fase 4B). Solo datos: el flujo HTTP
// está en scripts/seed-new-stores.mjs. Sin contraseñas aquí (se leen del entorno local).

const S_XL = ["S", "M", "L", "XL"];
const XS_L = ["XS", "S", "M", "L"];

export const OWNERS = {
  rodrigo: { firstName: "Rodrigo", lastName: "Salvatierra", email: "rodrigo.salvatierra@trama.seed.local", plan: "MAX" },
  daniela: { firstName: "Daniela", lastName: "Ferrufino", email: "daniela.ferrufino@trama.seed.local", plan: "PLUS" },
};

export const CUSTOMER = { firstName: "Camila", lastName: "Demo", email: "cliente.demo@trama.seed.local" };

export const STORES = [
  {
    slug: "casa-montalvo", name: "Casa Montalvo", owner: "rodrigo", tagline: "Sastrería contemporánea", segment: "HOMBRE", logo: "montalvo", sku: "CMV",
    palette: { paper: "#F4F1EA", ink: "#1C1F26", primary: "#23303F", accent: "#8C2F39" },
    contact: { phone: "+591 71234501", email: "hola@casamontalvo.bo", address: "Av. Ballivián 1120, Calacoto, La Paz", socials: { instagram: "@casamontalvo" } },
    branches: [
      { code: "CMV-CAL", name: "Calacoto", city: "La Paz", address: "Av. Ballivián 1120, Calacoto, La Paz", manager: ["Joaquín", "Mercado"] },
      { code: "CMV-EQP", name: "Equipetrol", city: "Santa Cruz", address: "Av. San Martín 450, Equipetrol, Santa Cruz", manager: ["Andrés", "Peña"] },
      { code: "CMV-CCL", name: "Cala Cala", city: "Cochabamba", address: "Av. América 780, Cala Cala, Cochabamba", manager: ["Martín", "Rocha"] },
    ],
    colors: { "Azul marino": "#23303F", "Gris carbón": "#3A3D42", "Negro": "#1C1C1E", "Camel": "#B0814F", "Vino": "#6E2233", "Blanco": "#F2F0EB", "Celeste": "#A9C6E2", "Gris perla": "#C9CCD1", "Verde oliva": "#5B6236", "Café": "#5A3B28" },
    categories: [
      { name: "Trajes y sacos", slug: "trajes-y-sacos", art: "blazer", sizes: S_XL, price: [890, 1900], colors: ["Azul marino", "Gris carbón", "Negro", "Camel"],
        composition: "70% lana virgen, 30% poliéster; forro de viscosa", care: "Limpieza en seco. Planchar a baja temperatura con paño.",
        lines: ["de corte entallado y hombro natural", "cruzado de solapa ancha", "de dos botones con caída impecable", "en lana fría de textura sutil", "de silueta moderna y forro respirable"],
        closers: ["Ideal para reuniones y celebraciones de día.", "Combina con camisa blanca y corbata lisa.", "Confeccionado para acompañarte de la oficina a la cena.", "Una pieza de sastrería que define el guardarropa.", "Se ajusta en tienda sin costo adicional."],
        products: ["Saco Valdivia", "Traje Altamira", "Saco Belgrano", "Traje Montecristo", "Saco Arequipa"] },
      { name: "Camisas", slug: "camisas", art: "shirt", sizes: S_XL, price: [180, 420], colors: ["Blanco", "Celeste", "Gris perla", "Vino"],
        composition: "100% algodón egipcio de fibra larga", care: "Lavar a 30 °C. Planchar del revés.",
        lines: ["de popelina con cuello italiano", "oxford de puño simple", "con textura espiga discreta", "slim fit de algodón suave", "de cuello francés para gemelos"],
        closers: ["Transpirable durante toda la jornada.", "Lista para llevar con o sin corbata.", "El básico que ordena cualquier traje.", "Su tejido resiste el uso diario sin perder forma.", "Un clásico con acabados de camisería fina."],
        products: ["Camisa Oporto", "Camisa Sevilla", "Camisa Lisboa", "Camisa Tarija", "Camisa Cádiz"] },
      { name: "Pantalones de vestir", slug: "pantalones-de-vestir", art: "trousers", sizes: ["38", "40", "42", "44", "46"], price: [320, 690], colors: ["Azul marino", "Gris carbón", "Camel", "Negro"],
        composition: "98% lana, 2% elastano", care: "Limpieza en seco o lavado delicado a mano.",
        lines: ["de pinza simple y bota recta", "de tiro medio y caída limpia", "en franela peinada", "de corte slim con pretina ajustable"],
        closers: ["Se lleva con saco o con un suéter fino.", "Mantiene el planchado durante todo el día.", "Ruedo terminado a tu medida en tienda.", "Cómodo para jornadas largas."],
        products: ["Pantalón Aragón", "Pantalón Ravena", "Pantalón Córdoba", "Pantalón Siena"] },
      { name: "Corbatas y accesorios", slug: "corbatas-y-accesorios", art: "tie", sizes: ["Única"], price: [180, 360], colors: ["Vino", "Azul marino", "Verde oliva", "Gris perla"],
        composition: "100% seda natural", care: "Limpieza en seco. Guardar enrollada.",
        lines: ["de seda tejida con microdiseño", "de punto con nudo firme", "estampada de motivo geométrico"],
        closers: ["El detalle que completa el traje.", "Ancho clásico de 7 cm.", "Presentada en caja de regalo."],
        products: ["Corbata Florencia", "Corbata Verona", "Corbata Burdeos"],
        extra: [
          { name: "Cinturón Toledo", art: "belt", sizes: ["90", "95", "100", "105"], price: [220, 380], colors: ["Negro", "Café"], composition: "Cuero vacuno curtido al vegetal, hebilla de latón", care: "Limpiar con paño seco; hidratar el cuero cada tres meses." },
          { name: "Cinturón Navarra", art: "belt", sizes: ["90", "95", "100", "105"], price: [240, 400], colors: ["Café", "Camel", "Negro"], composition: "Cuero graneado, hebilla niquelada", care: "Limpiar con paño seco; evitar la humedad." },
        ] },
      { name: "Calzado", slug: "calzado", art: "oxford", sizes: ["39", "40", "41", "42", "43", "44"], price: [690, 1450], colors: ["Negro", "Café", "Camel"],
        composition: "Capellada de cuero, forro de badana, suela de cuero", care: "Lustrar con crema neutra; usar hormas de cedro.",
        lines: ["de cordones con puntera lisa", "de horma amplia y cordones encerados", "de antifaz cosido a mano", "de perforado brogue fino"],
        closers: ["Construcción Blake para mayor flexibilidad.", "Acompaña igual al traje que al jean oscuro.", "Plantilla acolchada para todo el día.", "Fabricado en Bolivia por artesanos zapateros."],
        products: ["Oxford Bristol", "Oxford Windsor", "Derby Salamanca", "Mocasín Riviera"] },
      { name: "Abrigos", slug: "abrigos", art: "coat", sizes: S_XL, price: [1100, 1900], colors: ["Camel", "Azul marino", "Gris carbón"],
        composition: "80% lana, 20% cachemira", care: "Limpieza en seco. Colgar en percha ancha.",
        lines: ["cruzado de lana y cachemira", "largo hasta la rodilla con cinturón", "tipo gabardina de corte clásico"],
        closers: ["Abriga sin perder la línea del traje.", "Pensado para el invierno paceño.", "Botones de corozo y forro térmico."],
        products: ["Abrigo Illimani", "Gabardina Potosí", "Abrigo Sajama"] },
    ],
  },
  {
    slug: "impetu-sport", name: "Ímpetu Sport", owner: "rodrigo", tagline: "Entrena. Rinde. Repite.", segment: "DEPORTIVA", logo: "impetu", sku: "IMP",
    palette: { paper: "#F2F4F7", ink: "#0B1220", primary: "#0B1220", accent: "#C2410C" },
    contact: { phone: "+591 71234502", email: "hola@impetusport.bo", address: "Av. 20 de Octubre 2210, Sopocachi, La Paz", socials: { instagram: "@impetu.sport" } },
    branches: [
      { code: "IMP-SOP", name: "Sopocachi", city: "La Paz", address: "Av. 20 de Octubre 2210, Sopocachi, La Paz", manager: ["Diego", "Quiroga"] },
      { code: "IMP-URB", name: "Urubó", city: "Santa Cruz", address: "Urubó Village, local 14, Santa Cruz", manager: ["Sebastián", "Áñez"] },
    ],
    colors: { "Negro": "#111827", "Grafito": "#374151", "Naranja": "#EA580C", "Azul eléctrico": "#2B59C3", "Blanco": "#F3F4F6", "Verde lima": "#84CC16", "Rojo": "#DC2626", "Gris": "#9CA3AF" },
    categories: [
      { name: "Camisetas técnicas", slug: "camisetas-tecnicas", art: "tshirt", sizes: S_XL, price: [90, 220], colors: ["Negro", "Naranja", "Azul eléctrico", "Blanco", "Verde lima"],
        composition: "88% poliéster reciclado, 12% elastano", care: "Lavar en frío; no usar suavizante.",
        lines: ["de secado rápido con malla en la espalda", "ultraliviana para correr", "sin costuras laterales", "con protección UV 50+", "de compresión ligera"],
        closers: ["Evacúa el sudor en los entrenamientos más intensos.", "Detalles reflectantes para salir de noche.", "Pensada para la altura y el sol andino.", "No se pega al cuerpo ni marca el sudor.", "Ideal para gimnasio, trail y running."],
        products: ["Camiseta Vértigo", "Camiseta Ráfaga", "Camiseta Altitud", "Camiseta Pulso", "Camiseta Cumbre"] },
      { name: "Shorts", slug: "shorts", art: "shorts", sizes: S_XL, price: [80, 190], colors: ["Negro", "Grafito", "Azul eléctrico"],
        composition: "92% poliamida, 8% elastano", care: "Lavar en frío, secar a la sombra.",
        lines: ["de 5 pulgadas con calza interna", "con bolsillo trasero con cierre", "de tela elástica y liviana", "de entrenamiento funcional"],
        closers: ["Libertad total de movimiento.", "Cintura con cordón interno ajustable.", "Ideal para series y sprints.", "Se seca en minutos."],
        products: ["Short Sprint", "Short Zancada", "Short Rally", "Short Fondo"] },
      { name: "Buzos y hoodies", slug: "buzos-y-hoodies", art: "hoodie", sizes: S_XL, price: [260, 520], colors: ["Grafito", "Negro", "Naranja", "Gris"],
        composition: "80% algodón, 20% poliéster; interior perchado", care: "Lavar del revés a 30 °C.",
        lines: ["con capucha forrada", "de felpa perchada", "con bolsillo canguro", "de cuello alto con media cremallera"],
        closers: ["Abriga en el calentamiento y el post-entreno.", "Puños elásticos que no se deforman.", "Se lleva igual al gimnasio que a la ciudad.", "Corte holgado con buen calce de hombros."],
        products: ["Hoodie Ascenso", "Hoodie Tormenta", "Buzo Andino", "Hoodie Récord"] },
      { name: "Pantalones y joggers", slug: "pantalones-y-joggers", art: "joggers", sizes: ["30", "32", "34", "36", "38"], price: [220, 450], colors: ["Negro", "Grafito", "Azul eléctrico"],
        composition: "75% algodón, 25% poliéster", care: "Lavar en frío; no usar secadora.",
        lines: ["con puño elástico en el tobillo", "de corte cónico", "con bolsillos laterales con cierre", "de tela técnica elástica"],
        closers: ["Comodidad para entrenar y para viajar.", "Franjas laterales de contraste.", "Mantiene su forma lavado tras lavado.", "Cintura con cordón y elástico ancho."],
        products: ["Jogger Impulso", "Jogger Ruta", "Pantalón Tempo", "Jogger Meta"] },
      { name: "Cortavientos", slug: "cortavientos", art: "windbreaker", sizes: S_XL, price: [380, 650], colors: ["Naranja", "Negro", "Azul eléctrico"],
        composition: "100% nailon ripstop con recubrimiento repelente", care: "Lavar a mano; no planchar.",
        lines: ["que se pliega en su propio bolsillo", "con capucha ajustable", "repelente al agua"],
        closers: ["Corta el viento del altiplano sin agregar peso.", "Ventilación en la espalda para el ascenso.", "Detalles reflectantes 360°."],
        products: ["Cortavientos Chacaltaya", "Cortavientos Huayna", "Cortavientos Viento Sur"] },
      { name: "Calzado deportivo", slug: "calzado-deportivo", art: "sneaker", sizes: ["38", "39", "40", "41", "42", "43", "44"], price: [420, 650], colors: ["Negro", "Blanco", "Naranja"],
        composition: "Capellada de malla técnica, mediasuela de EVA, suela de caucho", care: "Limpiar con cepillo suave; secar a la sombra.",
        lines: ["de running con amortiguación reactiva", "de entrenamiento cruzado", "para trail con suela de tacos"],
        closers: ["Ligeras y estables desde el primer kilómetro.", "Agarre firme en superficies mixtas.", "Plantilla extraíble y transpirable."],
        products: ["Zapatilla Trueno", "Zapatilla Kilómetro", "Zapatilla Salto"] },
      { name: "Accesorios", slug: "accesorios", art: "cap", sizes: ["Única"], price: [60, 180], colors: ["Negro", "Blanco", "Naranja"],
        composition: "Poliéster técnico con banda absorbente", care: "Lavar a mano en agua fría.",
        lines: ["de visera curva y ajuste trasero", "de panel ventilado"],
        closers: ["Protege del sol en las salidas largas.", "Banda interna que absorbe el sudor."],
        products: ["Gorra Podio", "Gorra Sol de Altura"],
        extra: [
          { name: "Bolso Vestuario", art: "duffel", sizes: ["Única"], price: [240, 340], colors: ["Negro", "Grafito"], composition: "Poliéster 600D con base impermeable", care: "Limpiar con paño húmedo." },
        ] },
    ],
  },
  {
    slug: "solana", name: "Solana", owner: "daniela", tagline: "Luz, lino y verano.", segment: "MUJER", logo: "solana", sku: "SOL",
    palette: { paper: "#FFF8EF", ink: "#24313A", primary: "#115E59", accent: "#B8432F" },
    contact: { phone: "+591 71234503", email: "hola@solana.bo", address: "Calle Los Claveles 18, Equipetrol, Santa Cruz", socials: { instagram: "@solana.verano" } },
    branches: [
      { code: "SOL-EQP", name: "Equipetrol", city: "Santa Cruz", address: "Calle Los Claveles 18, Equipetrol, Santa Cruz", manager: ["Valentina", "Suárez"] },
      { code: "SOL-SOP", name: "Sopocachi", city: "La Paz", address: "Calle Belisario Salinas 540, Sopocachi, La Paz", manager: ["Lucía", "Mendoza"] },
      { code: "SOL-NOR", name: "Zona Norte", city: "Cochabamba", address: "Av. Circunvalación 1450, Zona Norte, Cochabamba", manager: ["Paola", "Céspedes"] },
    ],
    colors: { "Lino": "#E6DCC8", "Blanco": "#FAF7F0", "Terracota": "#B5562F", "Coral": "#E8735A", "Turquesa": "#2BA3A0", "Mostaza": "#D19B2A", "Rosa palo": "#E9B9B5", "Verde salvia": "#9CAF88", "Azul mar": "#2F5D8C", "Arena": "#D8C3A0" },
    categories: [
      { name: "Vestidos", slug: "vestidos", art: "dress", sizes: XS_L, price: [260, 520], colors: ["Terracota", "Lino", "Turquesa", "Coral", "Azul mar"],
        composition: "100% lino lavado", care: "Lavar a mano en agua fría; secar a la sombra.",
        lines: ["midi de tirantes finos", "largo con escote en V", "camisero con cinturón", "de vuelo con botones de coco", "cruzado de manga corta"],
        closers: ["Fresco para las tardes de verano.", "Se lleva con sandalias o con zapatillas blancas.", "Tejido que se suaviza con cada lavado.", "Ideal para la playa y la ciudad.", "Forro ligero que no transparenta."],
        products: ["Vestido Copacabana", "Vestido Samaipata", "Vestido Mar de Lino", "Vestido Atardecer", "Vestido Brisa"] },
      { name: "Blusas y tops", slug: "blusas-y-tops", art: "top", sizes: XS_L, price: [120, 260], colors: ["Blanco", "Coral", "Mostaza", "Verde salvia"],
        composition: "55% lino, 45% algodón", care: "Lavar a 30 °C; planchar húmedo.",
        lines: ["de hombros descubiertos", "con bordado artesanal", "cropped de tiras anudables", "de manga globo"],
        closers: ["Combina con shorts, faldas y jeans.", "Bordado a mano por artesanas de Chiquitos.", "Ligero y respirable.", "Un básico luminoso para el verano."],
        products: ["Blusa Lirio", "Top Coral", "Blusa Amapola", "Top Marea"] },
      { name: "Shorts y faldas", slug: "shorts-y-faldas", art: "skirt", sizes: XS_L, price: [140, 290], colors: ["Lino", "Terracota", "Arena", "Azul mar"],
        composition: "100% lino", care: "Lavar a mano; no usar secadora.",
        lines: ["midi con abertura lateral", "de tiro alto con pretina elástica", "plisada de caída suave", "envolvente con lazo"],
        closers: ["Fresca y cómoda en días calurosos.", "Se adapta a la cintura sin apretar.", "Combina con los tops de la colección.", "Bolsillos laterales funcionales."],
        products: ["Falda Ondina", "Falda Terral"],
        extra: [
          { name: "Short Lino Playa", art: "shorts", sizes: XS_L, price: [140, 220], colors: ["Lino", "Blanco", "Terracota"], composition: "100% lino", care: "Lavar a mano; secar a la sombra." },
          { name: "Short Bahía", art: "shorts", sizes: XS_L, price: [150, 240], colors: ["Azul mar", "Arena"], composition: "Algodón y lino", care: "Lavar en frío." },
        ] },
      { name: "Kimonos y pareos", slug: "kimonos-y-pareos", art: "kimono", sizes: ["S", "M", "L"], price: [180, 380], colors: ["Turquesa", "Terracota", "Mostaza", "Blanco"],
        composition: "100% viscosa estampada", care: "Lavar a mano en agua fría.",
        lines: ["largo con flecos en el borde", "corto de manga amplia", "multiuso que se anuda como pareo"],
        closers: ["Cubre del sol sin dar calor.", "Estampado inspirado en la flora del oriente.", "Perfecto sobre el traje de baño."],
        products: ["Kimono Palmar", "Kimono Isla", "Pareo Alba"] },
      { name: "Trajes de baño", slug: "trajes-de-bano", art: "swimsuit", sizes: XS_L, price: [180, 360], colors: ["Coral", "Azul mar", "Terracota", "Turquesa"],
        composition: "80% poliamida reciclada, 20% elastano; protección UV", care: "Enjuagar en agua dulce tras el uso.",
        lines: ["enterizo de espalda cruzada", "de escote cuadrado", "con fruncido frontal", "deportivo de tirantes anchos"],
        closers: ["Resistente al cloro y al sol.", "Sujeción cómoda sin aros.", "Tejido que no pierde color.", "Ideal para nadar y para tomar sol."],
        products: ["Bañador Caracola", "Bañador Salina", "Bañador Arrecife", "Bañador Laguna"] },
      { name: "Sandalias", slug: "sandalias", art: "sandal", sizes: ["36", "37", "38", "39", "40"], price: [160, 320], colors: ["Arena", "Terracota", "Blanco"],
        composition: "Tiras de cuero, plantilla de yute, suela de caucho", care: "Limpiar con paño húmedo; evitar el agua de mar.",
        lines: ["plana de tiras cruzadas", "con plataforma de yute", "tipo esclava con hebilla", "minimalista de dos tiras"],
        closers: ["Comodidad de la mañana a la noche.", "Hechas a mano en Santa Cruz.", "Plantilla anatómica.", "Ligeras para llevar de viaje."],
        products: ["Sandalia Tunari", "Sandalia Arena", "Sandalia Mistral", "Sandalia Coco"] },
      { name: "Sombreros y bolsos", slug: "sombreros-y-bolsos", art: "hat", sizes: ["Única"], price: [80, 280], colors: ["Arena", "Lino", "Terracota"],
        composition: "Paja toquilla tejida a mano", care: "Guardar sin aplastar; limpiar con cepillo suave.",
        lines: ["de ala ancha con cinta de algodón", "tipo fedora de paja"],
        closers: ["Protege del sol con estilo.", "Tejido a mano por artesanos."],
        products: ["Sombrero Solsticio", "Sombrero Pampa"],
        extra: [
          { name: "Bolso Totora", art: "tote", sizes: ["Única"], price: [180, 280], colors: ["Arena", "Terracota"], composition: "Totora del lago Titicaca y asas de cuero", care: "Limpiar con paño seco." },
        ] },
    ],
  },
];

/** Generador determinista (mulberry32) para precios, stock y combinaciones. */
export function rng(seedText) {
  let seed = [...seedText].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export const slugify = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Catálogo expandido de una tienda: productos con descripción de dos frases, colores, tallas y precio. */
export function productsOf(store) {
  const products = [];
  for (const category of store.categories) {
    category.products.forEach((name, index) => {
      const random = rng(`${store.slug}:${name}`);
      const [min, max] = category.price;
      const price = Math.round((min + random() * (max - min)) / 10) * 10 - 0.1;
      const count = 2 + (random() < 0.45 ? 1 : 0);
      const start = Math.floor(random() * category.colors.length);
      const colors = Array.from({ length: Math.min(count, category.colors.length) }, (_, offset) => category.colors[(start + offset) % category.colors.length]);
      const line = category.lines[index % category.lines.length];
      const closer = category.closers[(index + 1) % category.closers.length];
      products.push({
        name, slug: slugify(name), category: category.slug, art: category.art, sizes: category.sizes, colors, price: Number(price.toFixed(2)),
        description: `${name} ${line}. ${closer}`,
        composition: category.composition, careInstructions: category.care,
      });
    });
    for (const extra of category.extra ?? []) {
      const random = rng(`${store.slug}:${extra.name}`);
      const [min, max] = extra.price;
      products.push({
        name: extra.name, slug: slugify(extra.name), category: category.slug, art: extra.art, sizes: extra.sizes, colors: extra.colors,
        price: Number((Math.round((min + random() * (max - min)) / 10) * 10 - 0.1).toFixed(2)),
        description: `${extra.name}, ${extra.composition.toLowerCase()}. ${category.closers[0]}`,
        composition: extra.composition, careInstructions: extra.care,
      });
    }
  }
  return products;
}
