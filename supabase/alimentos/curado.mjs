// LA LISTA. Qué alimentos entran al catálogo, cómo se llaman aquí, y con
// qué se buscan.
//
// El orden importa: primero decido yo qué se come de verdad en México
// haciendo dieta o gimnasio, y luego el script va a USDA a por los
// números. Al revés -traducir los 7.793 de USDA- saldría un catálogo
// lleno de cosas que nadie apunta ("Alce, crudo") y con huecos en lo que
// sí se come a diario.
//
// Cada entrada:
//   n    nombre en español de México
//   cat  categoría del catálogo
//   e    'crudo' | 'cocido' | 'unico'   (unico = no cambia al cocinarse)
//   u    patrón contra la descripción de USDA
//   s    sinónimos para la búsqueda
//
// Sobre crudo/cocido: solo se desdobla donde de verdad cambia y donde la
// gente pesa de las dos formas. La carne y los cereales sí; una manzana
// no. Poner 'unico' es una decisión, no un descuido.
//
// LO QUE NO ENTRA, Y POR QUÉ:
//
//  · BEBIDAS CON ALCOHOL. No es por moralina: es que la app NO SABE
//    contarlas. Las calorías del diario son una columna generada en la
//    base —`protein_g*4 + carbs_g*4 + fat_g*9`— y el alcohol tiene 7
//    kcal por gramo sin ser ninguna de las tres cosas. Un destilado de
//    231 kcal entraría al anillo como CERO; un vino de 85, como 11.
//    Meterlas sería que la app diga que no te tomaste nada.
//    (La cerveza ya estaba desde la 0019 y tiene el mismo problema: 43
//    reales y 16 contadas. No se quita aquí a la ligera porque hay
//    diarios con ella; está anotado en `el-catalogo-crecio`.)
//
//  · MARCAS COMERCIALES. USDA tiene «Cereales ready-to-eat, RALSTON Corn
//    Flakes» y es el único cereal de caja del volcado. Un cereal de
//    desayuno haría falta, pero guardar una marca gringa como si fuera
//    «cereal» genérico es peor que el hueco.

export const CATALOGO = [

  // ---------- AVES ----------
  { n:'Pechuga de pollo', cat:'aves', e:'crudo',  u:/^Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw$/i, s:['pollo','pechuga'] },
  { n:'Pechuga de pollo', cat:'aves', e:'cocido', u:/^Chicken, broilers or fryers, breast, meat only, cooked, roasted$/i, s:['pollo','pechuga'] },
  { n:'Pierna de pollo', cat:'aves', e:'cocido', u:/^Chicken, broilers or fryers, leg, meat only, cooked, roasted$/i, s:['pollo'] },
  { n:'Muslo de pollo', cat:'aves', e:'cocido', u:/^Chicken, broilers or fryers, thigh, meat only, cooked, roasted$/i, s:['pollo'] },
  { n:'Pollo entero con piel', cat:'aves', e:'cocido', u:/^Chicken, broilers or fryers, meat and skin, cooked, roasted$/i, s:['pollo'] },
  { n:'Pechuga de pavo', cat:'aves', e:'cocido', u:/^Turkey, breast, from whole bird, meat only, with added solution, roasted$/i, s:['pavo'] },
  { n:'Pavo molido', cat:'aves', e:'cocido', u:/^Turkey, ground, cooked$/i, s:['pavo'] },

  { n:'Hígado de pollo', cat:'aves', e:'cocido', u:/^Chicken, liver, all classes, cooked, simmered$/i, s:['higado','pollo'] },
  // ---------- CARNES ----------
  { n:'Carne molida de res 90%', cat:'carnes', e:'crudo',  u:/^Beef, ground, 90% lean meat \/ 10% fat, raw$/i, s:['res','molida','carne molida'] },
  { n:'Carne molida de res 90%', cat:'carnes', e:'cocido', u:/^Beef, ground, 90% lean meat \/ 10% fat, patty, cooked, pan-broiled$/i, s:['res','molida'] },
  { n:'Carne molida de res 80%', cat:'carnes', e:'cocido', u:/^Beef, ground, 80% lean meat \/ 20% fat, patty, cooked, pan-broiled$/i, s:['res','molida'] },
  { n:'Bistec de res', cat:'carnes', e:'cocido', u:/^Beef, top sirloin, steak, separable lean only, trimmed to 1\/8" fat, .*cooked, broiled$/i, s:['res','bistec','sirloin'] },
  { n:'Arrachera', cat:'carnes', e:'cocido', u:/^Beef, flank, steak, separable lean only, trimmed to 0" fat, .*cooked, broiled$/i, s:['res','flank','arrachera'] },
  { n:'Filete de res', cat:'carnes', e:'cocido', u:/^Beef, tenderloin, steak, separable lean only, trimmed to 1\/8" fat, .*cooked, broiled$/i, s:['res','filete'] },
  { n:'Lomo de cerdo', cat:'carnes', e:'crudo',  u:/^Pork, fresh, loin, tenderloin, separable lean only, raw$/i, s:['cerdo','puerco','lomo'] },
  { n:'Lomo de cerdo', cat:'carnes', e:'cocido', u:/^Pork, fresh, loin, tenderloin, separable lean only, cooked, roasted$/i, s:['cerdo','puerco','lomo'] },
  { n:'Chuleta de cerdo', cat:'carnes', e:'cocido', u:/^Pork, fresh, loin, center loin \(chops\), bone-in, separable lean only, cooked, broiled$/i, s:['cerdo','puerco','chuleta'] },
  { n:'Tocino', cat:'carnes', e:'cocido', u:/^Pork, cured, bacon, cooked, baked$/i, s:['tocino','bacon'] },
  { n:'Jamón de pierna', cat:'carnes', e:'unico', u:/^Ham, sliced, pre-packaged, deli meat \(96%fat free, water added\)$/i, s:['jamon'] },
  { n:'Carne seca', cat:'carnes', e:'unico', u:/^Beef, cured, dried$/i, s:['machaca','cecina','carne seca'] },

  { n:'Chorizo', cat:'carnes', e:'crudo', u:/^Sausage, pork, chorizo, link or ground, raw$/i, s:['chorizo','longaniza'] },
  { n:'Salchicha', cat:'carnes', e:'cocido', u:/^Frankfurter, beef, heated$/i, s:['salchicha','hot dog','hotdog'] },
  { n:'Jamón de pavo', cat:'carnes', e:'unico', u:/^Ham, turkey, sliced, extra lean, prepackaged or deli$/i, s:['jamon','pavo'] },
  { n:'Maciza de cerdo', cat:'carnes', e:'cocido', u:/^Pork, fresh, shoulder, \(Boston butt\), blade \(steaks\), separable lean only, cooked, braised$/i, s:['carnitas','maciza','cerdo','puerco'] },
  { n:'Hígado de res', cat:'carnes', e:'cocido', u:/^Beef, variety meats and by-products, liver, cooked, pan-fried$/i, s:['higado','res'] },
  // ---------- PESCADOS ----------
  { n:'Salmón', cat:'pescados', e:'crudo',  u:/^Fish, salmon, Atlantic, farmed, raw$/i, s:['salmon'] },
  { n:'Salmón', cat:'pescados', e:'cocido', u:/^Fish, salmon, Atlantic, farmed, cooked, dry heat$/i, s:['salmon'] },
  { n:'Atún en agua', cat:'pescados', e:'unico', u:/^Fish, tuna, light, canned in water, without salt, drained solids$/i, s:['atun','lata'] },
  { n:'Atún en aceite', cat:'pescados', e:'unico', u:/^Fish, tuna, light, canned in oil, without salt, drained solids$/i, s:['atun','lata'] },
  { n:'Tilapia', cat:'pescados', e:'cocido', u:/^Fish, tilapia, cooked, dry heat$/i, s:['tilapia','mojarra'] },
  { n:'Mojarra', cat:'pescados', e:'crudo', u:/^Fish, tilapia, raw$/i, s:['tilapia','mojarra'] },
  { n:'Bacalao', cat:'pescados', e:'cocido', u:/^Fish, cod, Atlantic, cooked, dry heat$/i, s:['bacalao'] },
  { n:'Huachinango', cat:'pescados', e:'cocido', u:/^Fish, snapper, mixed species, cooked, dry heat$/i, s:['huachinango','pargo'] },
  { n:'Sardina en aceite', cat:'pescados', e:'unico', u:/^Fish, sardine, Atlantic, canned in oil, drained solids with bone$/i, s:['sardina'] },

  // ---------- MARISCOS ----------
  { n:'Camarón', cat:'mariscos', e:'crudo',  u:/^Crustaceans, shrimp, raw$/i, s:['camaron'] },
  { n:'Camarón', cat:'mariscos', e:'cocido', u:/^Crustaceans, shrimp, mixed species, cooked, moist heat \(may contain additives to retain moisture\)$/i, s:['camaron'] },
  { n:'Pulpo', cat:'mariscos', e:'cocido', u:/^Mollusks, octopus, common, cooked, moist heat$/i, s:['pulpo'] },
  { n:'Callo de hacha', cat:'mariscos', e:'cocido', u:/^Mollusks, scallop, mixed species, cooked, breaded and fried$/i, s:['callo','scallop'] },

  { n:'Almeja', cat:'mariscos', e:'cocido', u:/^Mollusks, clam, mixed species, cooked, moist heat$/i, s:['almeja'] },
  { n:'Mejillón', cat:'mariscos', e:'cocido', u:/^Mollusks, mussel, blue, cooked, moist heat$/i, s:['mejillon'] },
  // ---------- HUEVOS ----------
  { n:'Huevo entero', cat:'huevos', e:'crudo',  u:/^Egg, whole, raw, fresh$/i, s:['huevo','blanquillo'] },
  { n:'Huevo cocido', cat:'huevos', e:'cocido', u:/^Egg, whole, cooked, hard-boiled$/i, s:['huevo','duro'] },
  { n:'Huevo estrellado', cat:'huevos', e:'cocido', u:/^Egg, whole, cooked, fried$/i, s:['huevo','frito'] },
  { n:'Huevo revuelto', cat:'huevos', e:'cocido', u:/^Egg, whole, cooked, scrambled$/i, s:['huevo','revuelto'] },
  { n:'Clara de huevo', cat:'huevos', e:'crudo', u:/^Egg, white, raw, fresh$/i, s:['clara'] },
  { n:'Yema de huevo', cat:'huevos', e:'crudo', u:/^Egg, yolk, raw, fresh$/i, s:['yema'] },

  // ---------- LÁCTEOS ----------
  { n:'Leche entera', cat:'lacteos', e:'unico', u:/^Milk, whole, 3.25% milkfat, with added vitamin D$/i, s:['leche'] },
  { n:'Leche light', cat:'lacteos', e:'unico', u:/^Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D$/i, s:['leche','descremada'] },
  { n:'Leche descremada', cat:'lacteos', e:'unico', u:/^Milk, nonfat, fluid, with added vitamin A and vitamin D \(fat free or skim\)$/i, s:['leche'] },
  { n:'Yogur griego natural', cat:'lacteos', e:'unico', u:/^Yogurt, Greek, plain, nonfat/i, s:['yogur','yoghurt','griego'] },
  { n:'Yogur natural', cat:'lacteos', e:'unico', u:/^Yogurt, plain, low fat$/i, s:['yogur','yoghurt'] },
  { n:'Queso panela', cat:'lacteos', e:'unico', u:/^Cheese, fresh, queso fresco$/i, s:['queso','panela','fresco'] },
  { n:'Queso Oaxaca', cat:'lacteos', e:'unico', u:/^Cheese, mozzarella, part skim milk$/i, s:['queso','oaxaca','quesillo'] },
  { n:'Queso Chihuahua', cat:'lacteos', e:'unico', u:/^Cheese, mexican, queso chihuahua$/i, s:['queso','chihuahua','menonita'] },
  { n:'Queso cotija', cat:'lacteos', e:'unico', u:/^Cheese, mexican, queso cotija$/i, s:['queso','cotija','anejo'] },
  { n:'Queso cottage', cat:'lacteos', e:'unico', u:/^Cheese, cottage, lowfat, 1% milkfat$/i, s:['queso','cottage','requeson'] },
  { n:'Queso crema', cat:'lacteos', e:'unico', u:/^Cheese, cream$/i, s:['queso','philadelphia'] },
  { n:'Crema', cat:'lacteos', e:'unico', u:/^Cream, fluid, light whipping$/i, s:['crema'] },
  { n:'Mantequilla', cat:'grasas', e:'unico', u:/^Butter, salted$/i, s:['mantequilla'] },

  { n:'Queso fresco', cat:'lacteos', e:'unico', u:/^Cheese, fresh, queso fresco$/i, s:['queso','fresco','ranchero'] },
  { n:'Queso añejo', cat:'lacteos', e:'unico', u:/^Cheese, mexican, queso anejo$/i, s:['queso','anejo'] },
  { n:'Queso asadero', cat:'lacteos', e:'unico', u:/^Cheese, mexican, queso asadero$/i, s:['queso','asadero'] },
  { n:'Queso blanco', cat:'lacteos', e:'unico', u:/^Cheese, white, queso blanco$/i, s:['queso','blanco'] },
  { n:'Requesón', cat:'lacteos', e:'unico', u:/^Cheese, ricotta, part skim milk$/i, s:['requeson','ricotta'] },
  { n:'Queso amarillo', cat:'lacteos', e:'unico', u:/^Cheese food, pasteurized process, American, without added vitamin D$/i, s:['queso','amarillo','americano'] },
  // ---------- VERDURAS ----------
  { n:'Brócoli', cat:'verduras', e:'crudo',  u:/^Broccoli, raw$/i, s:['brocoli'] },
  { n:'Brócoli', cat:'verduras', e:'cocido', u:/^Broccoli, cooked, boiled, drained, without salt$/i, s:['brocoli'] },
  { n:'Espinaca', cat:'verduras', e:'crudo',  u:/^Spinach, raw$/i, s:['espinaca'] },
  { n:'Espinaca', cat:'verduras', e:'cocido', u:/^Spinach, cooked, boiled, drained, without salt$/i, s:['espinaca'] },
  { n:'Jitomate', cat:'verduras', e:'crudo', u:/^Tomatoes, red, ripe, raw, year round average$/i, s:['tomate','jitomate'] },
  { n:'Tomate verde', cat:'verduras', e:'crudo', u:/^Tomatillos, raw$/i, s:['tomatillo','tomate verde'] },
  { n:'Cebolla', cat:'verduras', e:'crudo', u:/^Onions, raw$/i, s:['cebolla'] },
  { n:'Chile poblano', cat:'verduras', e:'crudo', u:/^Peppers, pasilla, dried$/i, s:['chile','poblano'] },
  { n:'Chile jalapeño', cat:'verduras', e:'crudo', u:/^Peppers, jalapeno, raw$/i, s:['chile','jalapeno'] },
  { n:'Pimiento morrón', cat:'verduras', e:'crudo', u:/^Peppers, sweet, red, raw$/i, s:['pimiento','morron'] },
  { n:'Calabacita', cat:'verduras', e:'crudo', u:/^Squash, summer, zucchini, includes skin, raw$/i, s:['calabacita','calabaza','zucchini'] },
  { n:'Zanahoria', cat:'verduras', e:'crudo', u:/^Carrots, raw$/i, s:['zanahoria'] },
  { n:'Lechuga romana', cat:'verduras', e:'crudo', u:/^Lettuce, cos or romaine, raw$/i, s:['lechuga','romana'] },
  { n:'Pepino', cat:'verduras', e:'crudo', u:/^Cucumber, with peel, raw$/i, s:['pepino'] },
  { n:'Nopal', cat:'verduras', e:'crudo', u:/^Nopales, raw$/i, s:['nopal','nopales'] },
  { n:'Nopal', cat:'verduras', e:'cocido', u:/^Nopales, cooked, without salt$/i, s:['nopal','nopales'] },
  { n:'Chayote', cat:'verduras', e:'crudo', u:/^Chayote, fruit, raw$/i, s:['chayote'] },
  { n:'Champiñón', cat:'verduras', e:'crudo', u:/^Mushrooms, white, raw$/i, s:['champinon','hongo','seta'] },
  { n:'Ejote', cat:'verduras', e:'cocido', u:/^Beans, snap, green, cooked, boiled, drained, without salt$/i, s:['ejote','judia'] },
  { n:'Elote', cat:'verduras', e:'cocido', u:/^Corn, sweet, yellow, cooked, boiled, drained, without salt$/i, s:['elote','maiz','choclo'] },
  { n:'Coliflor', cat:'verduras', e:'crudo', u:/^Cauliflower, raw$/i, s:['coliflor'] },
  { n:'Apio', cat:'verduras', e:'crudo', u:/^Celery, raw$/i, s:['apio'] },
  { n:'Betabel', cat:'verduras', e:'cocido', u:/^Beets, cooked, boiled, drained$/i, s:['betabel','remolacha'] },
  { n:'Col', cat:'verduras', e:'crudo', u:/^Cabbage, raw$/i, s:['col','repollo'] },

  { n:'Acelga', cat:'verduras', e:'crudo', u:/^Chard, swiss, raw$/i, s:['acelga'] },
  { n:'Acelga', cat:'verduras', e:'cocido', u:/^Chard, swiss, cooked, boiled, drained, without salt$/i, s:['acelga'] },
  { n:'Rábano', cat:'verduras', e:'unico', u:/^Radishes, raw$/i, s:['rabano'] },
  { n:'Cilantro', cat:'verduras', e:'unico', u:/^Coriander \(cilantro\) leaves, raw$/i, s:['cilantro'] },
  { n:'Berenjena', cat:'verduras', e:'crudo', u:/^Eggplant, raw$/i, s:['berenjena'] },
  { n:'Berenjena', cat:'verduras', e:'cocido', u:/^Eggplant, cooked, boiled, drained, without salt$/i, s:['berenjena'] },
  { n:'Poro', cat:'verduras', e:'crudo', u:/^Leeks, \(bulb and lower leaf-portion\), raw$/i, s:['poro','puerro'] },
  { n:'Chile serrano', cat:'verduras', e:'unico', u:/^Peppers, serrano, raw$/i, s:['chile','serrano'] },
  { n:'Jícama', cat:'verduras', e:'unico', u:/^Yambean \(jicama\), raw$/i, s:['jicama'] },
  { n:'Espárrago', cat:'verduras', e:'crudo', u:/^Asparagus, raw$/i, s:['esparrago'] },
  { n:'Espárrago', cat:'verduras', e:'cocido', u:/^Asparagus, cooked, boiled, drained$/i, s:['esparrago'] },
  { n:'Calabaza de castilla', cat:'verduras', e:'crudo', u:/^Pumpkin, raw$/i, s:['calabaza','castilla'] },
  { n:'Chícharo', cat:'verduras', e:'crudo', u:/^Peas, green, raw$/i, s:['chicharo','guisante'] },
  { n:'Chícharo', cat:'verduras', e:'cocido', u:/^Peas, green, frozen, cooked, boiled, drained, without salt$/i, s:['chicharo','guisante'] },
  // ---------- FRUTAS ----------
  { n:'Plátano', cat:'frutas', e:'unico', u:/^Bananas, raw$/i, s:['platano','banana','banano'] },
  { n:'Manzana', cat:'frutas', e:'unico', u:/^Apples, raw, gala, with skin/i, s:['manzana'] },
  { n:'Naranja', cat:'frutas', e:'unico', u:/^Oranges, raw, all commercial varieties$/i, s:['naranja'] },
  { n:'Fresa', cat:'frutas', e:'unico', u:/^Strawberries, raw$/i, s:['fresa','frutilla'] },
  { n:'Papaya', cat:'frutas', e:'unico', u:/^Papayas, raw$/i, s:['papaya'] },
  { n:'Piña', cat:'frutas', e:'unico', u:/^Pineapple, raw, all varieties$/i, s:['pina','ananas'] },
  { n:'Mango', cat:'frutas', e:'unico', u:/^Mangos, raw$/i, s:['mango'] },
  { n:'Sandía', cat:'frutas', e:'unico', u:/^Watermelon, raw$/i, s:['sandia'] },
  { n:'Melón', cat:'frutas', e:'unico', u:/^Melons, cantaloupe, raw$/i, s:['melon'] },
  { n:'Uva', cat:'frutas', e:'unico', u:/^Grapes, red or green \(European type, such as Thompson seedless\), raw$/i, s:['uva'] },
  { n:'Aguacate', cat:'frutas', e:'unico', u:/^Avocados, raw, all commercial varieties$/i, s:['aguacate','palta'] },
  { n:'Limón', cat:'frutas', e:'unico', u:/^Lemons, raw, without peel$/i, s:['limon','lima'] },
  { n:'Guayaba', cat:'frutas', e:'unico', u:/^Guavas, common, raw$/i, s:['guayaba'] },
  { n:'Toronja', cat:'frutas', e:'unico', u:/^Grapefruit, raw, pink and red and white, all areas$/i, s:['toronja','pomelo'] },
  { n:'Durazno en jugo', cat:'frutas', e:'unico', u:/^Peaches, canned, juice pack, solids and liquids$/i, s:['durazno','melocoton'] },
  { n:'Pera', cat:'frutas', e:'unico', u:/^Pears, raw$/i, s:['pera'] },
  { n:'Arándano', cat:'frutas', e:'unico', u:/^Blueberries, raw$/i, s:['arandano','blueberry'] },
  { n:'Ciruela', cat:'frutas', e:'unico', u:/^Plums, raw$/i, s:['ciruela'] },
  { n:'Kiwi', cat:'frutas', e:'unico', u:/^Kiwifruit, green, raw$/i, s:['kiwi'] },
  { n:'Mandarina', cat:'frutas', e:'unico', u:/^Tangerines, \(mandarin oranges\), raw$/i, s:['mandarina'] },

  { n:'Mamey', cat:'frutas', e:'unico', u:/^Sapote, mamey, raw$/i, s:['mamey','zapote'] },
  { n:'Guanábana', cat:'frutas', e:'unico', u:/^Soursop, raw$/i, s:['guanabana'] },
  { n:'Granada', cat:'frutas', e:'unico', u:/^Pomegranates, raw$/i, s:['granada'] },
  { n:'Higo', cat:'frutas', e:'unico', u:/^Figs, raw$/i, s:['higo'] },
  { n:'Zarzamora', cat:'frutas', e:'unico', u:/^Blackberries, raw$/i, s:['zarzamora','mora'] },
  { n:'Frambuesa', cat:'frutas', e:'unico', u:/^Raspberries, raw$/i, s:['frambuesa'] },
  { n:'Cereza', cat:'frutas', e:'unico', u:/^Cherries, sweet, raw$/i, s:['cereza'] },
  { n:'Tuna', cat:'frutas', e:'unico', u:/^Prickly pears, raw$/i, s:['tuna','nopal'] },
  { n:'Ciruela pasa', cat:'frutas', e:'unico', u:/^Plums, dried \(prunes\), uncooked$/i, s:['ciruela','pasa'] },
  { n:'Pasas', cat:'frutas', e:'unico', u:/^Raisins, golden, seedless$/i, s:['pasas','uva pasa'] },
  // ---------- LEGUMBRES ----------
  { n:'Frijol negro', cat:'legumbres', e:'crudo',  u:/^Beans, black, mature seeds, raw$/i, s:['frijol','frijoles'] },
  { n:'Frijol negro', cat:'legumbres', e:'cocido', u:/^Beans, black, mature seeds, cooked, boiled, without salt$/i, s:['frijol','frijoles'] },
  { n:'Frijol pinto', cat:'legumbres', e:'cocido', u:/^Beans, pinto, mature seeds, cooked, boiled, without salt$/i, s:['frijol','frijoles','bayo'] },
  { n:'Lenteja', cat:'legumbres', e:'crudo',  u:/^Lentils, raw$/i, s:['lenteja'] },
  { n:'Lenteja', cat:'legumbres', e:'cocido', u:/^Lentils, mature seeds, cooked, boiled, without salt$/i, s:['lenteja'] },
  { n:'Garbanzo', cat:'legumbres', e:'cocido', u:/^Chickpeas \(garbanzo beans, bengal gram\), mature seeds, cooked, boiled, without salt$/i, s:['garbanzo'] },
  { n:'Haba', cat:'legumbres', e:'cocido', u:/^Broadbeans \(fava beans\), mature seeds, cooked, boiled, without salt$/i, s:['haba','fava'] },
  { n:'Soya', cat:'legumbres', e:'cocido', u:/^Soybeans, mature seeds, cooked, boiled, with salt$/i, s:['soya','soja'] },

  { n:'Frijoles refritos', cat:'legumbres', e:'unico', u:/^Refried beans, canned, traditional style$/i, s:['frijol','frijoles','refritos'] },
  // ---------- CEREALES ----------
  { n:'Avena', cat:'cereales', e:'crudo', u:/^Cereals, oats, regular and quick, not fortified, dry$/i, s:['avena','hojuelas'] },
  { n:'Avena cocida', cat:'cereales', e:'cocido', u:/^Cereals, oats, regular and quick, unenriched, cooked with water \(includes boiling and microwaving\), without salt$/i, s:['avena','atole'] },
  { n:'Quinoa', cat:'cereales', e:'crudo',  u:/^Quinoa, uncooked$/i, s:['quinoa','quinua'] },
  { n:'Quinoa', cat:'cereales', e:'cocido', u:/^Quinoa, cooked$/i, s:['quinoa','quinua'] },
  { n:'Amaranto', cat:'cereales', e:'crudo', u:/^Amaranth grain, uncooked$/i, s:['amaranto','alegria'] },

  { n:'Granola', cat:'cereales', e:'unico', u:/^Cereals ready-to-eat, granola, homemade$/i, s:['granola'] },
  { n:'Totopos', cat:'cereales', e:'unico', u:/^Snacks, tortilla chips, plain, white corn, salted$/i, s:['totopos','tostada','nachos'] },
  // ---------- ARROCES ----------
  { n:'Arroz blanco', cat:'arroces', e:'crudo',  u:/^Rice, white, long-grain, regular, raw, unenriched$/i, s:['arroz'] },
  { n:'Arroz blanco', cat:'arroces', e:'cocido', u:/^Rice, white, long-grain, regular, cooked, unenriched, with salt$/i, s:['arroz'] },
  { n:'Arroz integral', cat:'arroces', e:'crudo',  u:/^Rice, brown, long-grain, raw/i, s:['arroz','integral'] },
  { n:'Arroz integral', cat:'arroces', e:'cocido', u:/^Rice, brown, long-grain, cooked/i, s:['arroz','integral'] },

  // ---------- PASTAS ----------
  { n:'Pasta', cat:'pastas', e:'crudo',  u:/^Pasta, dry, unenriched$/i, s:['pasta','espagueti','spaghetti','fideo'] },
  { n:'Pasta', cat:'pastas', e:'cocido', u:/^Pasta, cooked, unenriched, without added salt$/i, s:['pasta','espagueti','spaghetti','fideo'] },
  { n:'Pasta integral', cat:'pastas', e:'cocido', u:/^Pasta, whole-wheat, cooked \(Includes foods for USDA's Food Distribution Program\)$/i, s:['pasta','integral'] },

  // ---------- TUBÉRCULOS ----------
  { n:'Papa', cat:'tuberculos', e:'crudo',  u:/^Potatoes, flesh and skin, raw$/i, s:['papa','patata'] },
  { n:'Papa cocida', cat:'tuberculos', e:'cocido', u:/^Potatoes, boiled, cooked without skin, flesh, without salt$/i, s:['papa','patata'] },
  { n:'Camote', cat:'tuberculos', e:'crudo',  u:/^Sweet potato, raw, unprepared/i, s:['camote','batata','boniato'] },
  { n:'Camote cocido', cat:'tuberculos', e:'cocido', u:/^Sweet potato, cooked, boiled, without skin$/i, s:['camote','batata'] },
  { n:'Yuca', cat:'tuberculos', e:'crudo', u:/^Cassava, raw$/i, s:['yuca','mandioca'] },

  { n:'Papa a la francesa', cat:'tuberculos', e:'cocido', u:/^Potatoes, french fried, all types, salt not added in processing, frozen, oven-heated$/i, s:['papa','papas','frita','francesa'] },
  // ---------- SEMILLAS Y FRUTOS SECOS ----------
  { n:'Almendra', cat:'frutos_secos', e:'unico', u:/^Nuts, almonds$/i, s:['almendra'] },
  { n:'Nuez', cat:'frutos_secos', e:'unico', u:/^Nuts, walnuts, english$/i, s:['nuez','nogal'] },
  { n:'Cacahuate', cat:'frutos_secos', e:'unico', u:/^Peanuts, all types, raw$/i, s:['cacahuate','mani'] },
  { n:'Pistache', cat:'frutos_secos', e:'unico', u:/^Nuts, pistachio nuts, raw$/i, s:['pistache','pistacho'] },
  { n:'Nuez de la India', cat:'frutos_secos', e:'unico', u:/^Nuts, cashew nuts, raw$/i, s:['nuez de la india','cashew','maranon'] },
  { n:'Crema de cacahuate', cat:'frutos_secos', e:'unico', u:/^Peanut butter, smooth style, without salt$/i, s:['crema de cacahuate','mantequilla de mani'] },
  { n:'Chía', cat:'semillas', e:'unico', u:/^Seeds, chia seeds, dried$/i, s:['chia'] },
  { n:'Linaza', cat:'semillas', e:'unico', u:/^Seeds, flaxseed$/i, s:['linaza','lino'] },
  { n:'Pepita de calabaza', cat:'semillas', e:'unico', u:/^Seeds, pumpkin and squash seed kernels, dried$/i, s:['pepita','calabaza'] },
  { n:'Ajonjolí', cat:'semillas', e:'unico', u:/^Seeds, sesame seeds, whole, dried$/i, s:['ajonjoli','sesamo'] },
  { n:'Semilla de girasol', cat:'semillas', e:'unico', u:/^Seeds, sunflower seed kernels, dried$/i, s:['girasol','pipa'] },

  { n:'Coco', cat:'frutos_secos', e:'unico', u:/^Nuts, coconut meat, raw$/i, s:['coco'] },
  // ---------- ACEITES Y GRASAS ----------
  { n:'Aceite de oliva', cat:'aceites', e:'unico', u:/^Oil, olive, salad or cooking$/i, s:['aceite','oliva'] },
  { n:'Aceite de aguacate', cat:'aceites', e:'unico', u:/^Oil, avocado$/i, s:['aceite','aguacate'] },
  { n:'Aceite de coco', cat:'aceites', e:'unico', u:/^Oil, coconut$/i, s:['aceite','coco'] },
  { n:'Aceite vegetal', cat:'aceites', e:'unico', u:/^Oil, canola$/i, s:['aceite','canola','vegetal'] },
  { n:'Manteca de cerdo', cat:'grasas', e:'unico', u:/^Lard$/i, s:['manteca'] },

  { n:'Aceitunas', cat:'grasas', e:'unico', u:/^Olives, ripe, canned \(small-extra large\)$/i, s:['aceituna','aceitunas'] },
  // ---------- HARINAS Y PANES ----------
  { n:'Harina de trigo', cat:'harinas', e:'crudo', u:/^Wheat flour, white, all-purpose, unenriched$/i, s:['harina','trigo'] },
  { n:'Harina de maíz', cat:'harinas', e:'crudo', u:/^Corn flour, masa, unenriched, white$/i, s:['harina','maiz','masa','maseca'] },
  { n:'Harina de avena', cat:'harinas', e:'crudo', u:/^Cereals ready-to-eat, QUAKER, Oatmeal Squares$/i, s:['harina','avena'] },
  { n:'Tortilla de maíz', cat:'panes', e:'unico', u:/^Tortillas, ready-to-bake or -fry, corn, without added salt$/i, s:['tortilla','maiz'] },
  { n:'Tortilla de harina', cat:'panes', e:'unico', u:/^Tortillas, ready-to-bake or -fry, flour, refrigerated$/i, s:['tortilla','harina'] },
  { n:'Pan blanco', cat:'panes', e:'unico', u:/^Bread, white, commercially prepared \(includes soft bread crumbs\)$/i, s:['pan','bolillo'] },
  { n:'Pan integral', cat:'panes', e:'unico', u:/^Bread, whole-wheat, commercially prepared$/i, s:['pan','integral'] },
  { n:'Bolillo', cat:'panes', e:'unico', u:/^Rolls, hard \(includes kaiser\)$/i, s:['bolillo','telera','pan'] },
  // EL MISMO PAN, PEDIDO DE OTRA FORMA. Arriba en gramos, para quien lo
  // pesa; aquí por piezas, para quien se come un bolillo y ya.
  //
  // `pieza` son los gramos de UNA, y no me los invento: salen del mismo
  // registro de USDA, de su tabla de porciones. Ese fdc_id trae dos,
  // «oz» (28,35 g) y «roll (3-1/2" dia)» (57 g); la de la pieza es la
  // segunda. La primera es la que ya usa la fila de arriba como
  // `porcion`, y por eso allí no sirve de nada: nadie se come una onza
  // de pan.
  //
  // Dos filas y no una porque la base tiene `unique (nombre, estado)` y
  // porque una fila solo puede pedirse de una forma. Que el nombre diga
  // cuál es cada una es justo lo que hace que se puedan distinguir al
  // buscar.
  //
  // OJO: 57 g es el panecillo duro de USDA, no necesariamente el bolillo
  // de tu panadería, que suele andar entre 60 y 80. Si el tuyo pesa
  // otra cosa, pésalo una vez y usa la fila de gramos.
  { n:'Bolillo (pieza)', cat:'panes', e:'unico', u:/^Rolls, hard \(includes kaiser\)$/i,
    pieza:57, s:['bolillo','telera','pan','pieza'] },

  { n:'Hot cakes', cat:'panes', e:'cocido', u:/^Pancakes, plain, prepared from recipe$/i, s:['hot cakes','hotcakes','panqueque'] },
  { n:'Galletas saladas', cat:'panes', e:'unico', u:/^Crackers, saltines \(includes oyster, soda, soup\)$/i, s:['galleta','galletas','saladas'] },
  // ---------- AZÚCARES ----------
  { n:'Azúcar', cat:'azucares', e:'unico', u:/^Sugars, granulated$/i, s:['azucar'] },
  { n:'Miel', cat:'azucares', e:'unico', u:/^Honey$/i, s:['miel'] },
  { n:'Piloncillo', cat:'azucares', e:'unico', u:/^Sugars, brown$/i, s:['piloncillo','panela','azucar morena'] },
  { n:'Chocolate amargo', cat:'azucares', e:'unico', u:/^Baking chocolate, unsweetened, squares$/i, s:['chocolate','cacao'] },

  { n:'Helado de vainilla', cat:'azucares', e:'unico', u:/^Ice creams, vanilla$/i, s:['helado','nieve'] },
  { n:'Cajeta', cat:'azucares', e:'unico', u:/^Dulce de Leche$/i, s:['cajeta','dulce de leche'] },
  { n:'Mermelada', cat:'azucares', e:'unico', u:/^Jams and preserves$/i, s:['mermelada'] },
  { n:'Chocolate con leche', cat:'azucares', e:'unico', u:/^Candies, milk chocolate$/i, s:['chocolate'] },
  { n:'Crema de avellana', cat:'azucares', e:'unico', u:/^Chocolate-flavored hazelnut spread$/i, s:['avellana','nutella','untable'] },
  // ---------- CONDIMENTOS ----------
  { n:'Sal', cat:'condimentos', e:'unico', u:/^Salt, table$/i, s:['sal'] },
  { n:'Salsa de soya', cat:'condimentos', e:'unico', u:/^Soy sauce made from soy and wheat \(shoyu\)$/i, s:['soya','soja','salsa'] },
  { n:'Vinagre', cat:'condimentos', e:'unico', u:/^Vinegar, distilled$/i, s:['vinagre'] },
  { n:'Mayonesa', cat:'condimentos', e:'unico', u:/^Salad dressing, mayonnaise, regular$/i, s:['mayonesa'] },
  { n:'Mostaza', cat:'condimentos', e:'unico', u:/^Mustard, prepared, yellow$/i, s:['mostaza'] },
  { n:'Catsup', cat:'condimentos', e:'unico', u:/^Catsup$/i, s:['catsup','ketchup','salsa de tomate'] },
  { n:'Ajo', cat:'condimentos', e:'crudo', u:/^Garlic, raw$/i, s:['ajo'] },

  { n:'Salsa roja', cat:'condimentos', e:'unico', u:/^Sauce, salsa, ready-to-serve$/i, s:['salsa','roja','picante'] },
  { n:'Salsa verde', cat:'condimentos', e:'unico', u:/^Sauce, salsa, verde, ready-to-serve$/i, s:['salsa','verde','picante'] },
  // ---------- BEBIDAS ----------
  { n:'Café negro', cat:'bebidas', e:'unico', u:/^Beverages, coffee, brewed, prepared with tap water$/i, s:['cafe'] },
  { n:'Té negro', cat:'bebidas', e:'unico', u:/^Beverages, tea, black, brewed, prepared with tap water$/i, s:['te'] },
  { n:'Cerveza', cat:'bebidas', e:'unico', u:/^Alcoholic beverage, beer, regular, all$/i, s:['cerveza'] },
  { n:'Refresco de cola', cat:'bebidas', e:'unico', u:/^Beverages, carbonated, cola, regular$/i, s:['refresco','coca','soda'] },
  { n:'Jugo de naranja', cat:'bebidas', e:'unico', u:/^Orange juice, canned, unsweetened$/i, s:['jugo','naranja'] },
  { n:'Agua mineral', cat:'bebidas', e:'unico', u:/^Beverages, water, bottled, non-carbonated, .*$/i, s:['agua'] },

  { n:'Leche de almendra', cat:'bebidas', e:'unico', u:/^Beverages, almond milk, unsweetened, shelf stable$/i, s:['leche','almendra','vegetal'] },
  { n:'Leche de soya', cat:'bebidas', e:'unico', u:/^Soymilk \(all flavors\), unsweetened, with added calcium, vitamins A and D$/i, s:['leche','soya','vegetal'] },
  { n:'Jugo de manzana', cat:'bebidas', e:'unico', u:/^Apple juice, canned or bottled, unsweetened, without added ascorbic acid$/i, s:['jugo','manzana'] },
  { n:'Agua de coco', cat:'bebidas', e:'unico', u:/^Beverages, Coconut water, ready-to-drink, unsweetened$/i, s:['agua','coco'] },
  // ---------- OTROS ----------
  { n:'Proteína de suero', cat:'otros', e:'unico', u:/^Beverages, Whey protein powder isolate$/i, s:['proteina','whey','suero'] },
  { n:'Tofu', cat:'otros', e:'unico', u:/^Tofu, raw, firm, prepared with calcium sulfate$/i, s:['tofu'] },
  { n:'Gelatina', cat:'otros', e:'unico', u:/^Gelatins, dry powder, unsweetened$/i, s:['gelatina','grenetina'] },
  { n:'Caldo de pollo', cat:'otros', e:'unico', u:/^Soup, chicken broth or bouillon, dry, prepared with water$/i, s:['caldo','consome','pollo'] },
];
