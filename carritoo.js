// Línea 1 corregida:
const database = firebase.database(); 
// 1. Inicializar el carrito desde la memoria del navegador
let carrito = JSON.parse(localStorage.getItem('carrito')) || [];


// 2. Seleccionar todos tus botones de agregar con su clase exacta
const botonesAdquirir = document.querySelectorAll('.btn-adquirir');

// 3. Recorrer cada botón y escuchar el evento Click
botonesAdquirir.forEach(boton => {
    boton.addEventListener('click', (e) => {
        e.preventDefault(); // Evita que la página salte al inicio por el href="#"

        const tarjeta = e.target.closest('.tarjeta-producto');
        if (!tarjeta) return;

        const id = e.target.getAttribute('data-id');
        const nombre = e.target.getAttribute('data-nombre');
        const precio = parseFloat(e.target.getAttribute('data-precio'));

        // 🛑 SOLUCIÓN EN TIEMPO REAL: Preguntamos el stock exacto en Firebase antes de avanzar
        database.ref('productos/' + id + '/stock').once('value').then((snapshot) => {
            const stockActual = snapshot.val();

            // Si el producto no existe en Firebase o su stock es 0 o menor
            if (stockActual === null || stockActual <= 0) {
                alert(`¡Vaya! El artículo "${nombre}" se ha agotado por completo en nuestro inventario místico.`);
                return;
            }

            // Si hay stock, procedemos a descontar 1 en Firebase inmediatamente
            database.ref('productos/' + id).update({
                stock: stockActual - 1
            });

            // Estructura del producto para guardarlo localmente
            const productoSeleccionado = {
                id: id,
                nombre: nombre,
                precio: precio,
                cantidad: 1
            };

            // Verificar si el producto ya estaba en la lista local
            const existe = carrito.some(prod => prod.id === id);
            
            if (existe) {
                // Si ya existe, recorremos la lista y aumentamos solo su cantidad
                carrito = carrito.map(prod => {
                    if (prod.id === id) {
                        prod.cantidad++;
                        return prod;
                    } else {
                        return prod;
                    }
                });
            } else {
                // Si es un producto nuevo, lo agregamos a la lista
                carrito.push(productoSeleccionado);
            }

            // Guardar en el almacenamiento local (localStorage)
            localStorage.setItem('carrito', JSON.stringify(carrito));
            alert(`¡${nombre} se agregó a tu carrito místico!`);
            
        }).catch((error) => {
            console.error("Error al conectar con Firebase: ", error);
            alert("Hubo un problema de conexión con el inventario. Inténtalo de nuevo.");
        });
    });
});

// === ELEMENTOS DEL DOM PARA EL MODAL (VENTANA FLOTANTE) ===
const modal = document.getElementById('modal-carrito');
const btnVerCarrito = document.getElementById('btn-ver-carrito');
const btnCerrar = document.querySelector('.cerrar-modal');
const contenedorLista = document.getElementById('lista-carrito-contenedor');
const txtTotal = document.getElementById('precio-total');

// Función para actualizar y pintar la lista en la pantalla
function renderizarCarrito() {
    // Limpiamos lo que haya actualmente
    contenedorLista.innerHTML = '';
    
    if (carrito.length === 0) {
        contenedorLista.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío actualmente.</p>';
        txtTotal.textContent = '0';
        return;
    }
    
    let subtotalSumado = 0;
    
    // Recorremos los productos guardados
    carrito.forEach(producto => {
        const fila = document.createElement('div');
        fila.classList.add('item-carrito');
        
        const costoTotalItem = producto.precio * producto.cantidad;
        subtotalSumado += costoTotalItem;
        
        fila.innerHTML = `
            <div>
                <strong>${producto.nombre}</strong> <br>
                <small>$${producto.precio} x ${producto.cantidad}</small>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <span>$${costoTotalItem}</span>
                <button class="btn-eliminar" data-id="${producto.id}" style="background: none; border: none; color: #c70039; cursor: pointer; font-size: 1.2rem; font-weight: bold;">&times;</button>
            </div>
        `;
        contenedorLista.appendChild(fila);
    });
    
    // Pintamos el total final en la interfaz
    txtTotal.textContent = subtotalSumado;

    // === ASIGNAR EVENTOS A LOS BOTONES DE ELIMINAR (CON DEVOLUCIÓN DE STOCK) ===
    const botonesEliminar = document.querySelectorAll('.btn-eliminar');
    botonesEliminar.forEach(boton => {
        boton.addEventListener('click', (e) => {
            const idEliminar = e.target.getAttribute('data-id');
            
            // 1. Buscamos el producto que van a remover para saber cuántas piezas tenían acumuladas
            const productoABorrar = carrito.find(prod => prod.id === idEliminar);
            
            if (productoABorrar) {
                // 2. Traemos el stock actual de Firebase para no sobreescribir datos viejos
                database.ref('productos/' + idEliminar + '/stock').once('value').then((snapshot) => {
                    const stockEnFirebase = snapshot.val() || 0;
                    
                    // 3. Devolvemos la cantidad que estaba en el carrito a Firebase
                    database.ref('productos/' + idEliminar).update({
                        stock: stockEnFirebase + productoABorrar.cantidad
                    });
                });
            }
            
            // 4. Quitamos el producto del array local, actualizamos localStorage y redibujamos
            carrito = carrito.filter(producto => producto.id !== idEliminar);
            localStorage.setItem('carrito', JSON.stringify(carrito));
            renderizarCarrito();
        });
    });
}

// Abrir la ventana al dar clic en "Ver carrito"
btnVerCarrito.addEventListener('click', () => {
    modal.style.display = 'block';
    renderizarCarrito(); 
});

// Cerrar la ventana al dar clic en la X
btnCerrar.addEventListener('click', () => {
    modal.style.display = 'none';
});

// Cerrar también si hacen clic fuera de la caja del contenido
window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// === PROCESAR PAGO EN LA VENTANA FLOTANTE ===
const btnPagar = document.getElementById('btn-pagar');

btnPagar.addEventListener('click', () => {
    if (carrito.length === 0) {
        alert('Tu carrito místico está vacío. Agrega algunos productos antes de pagar.');
        return;
    }

    let totalFinal = 0;
    let resumenProductos = '';
    
    carrito.forEach(prod => {
        totalFinal += prod.precio * prod.cantidad;
        resumenProductos += `- ${prod.nombre} (x${prod.cantidad})\n`;
    });
    
    // Mensaje automatizado para WhatsApp
    const mensajeWhatsApp = encodeURIComponent(
        `¡Hola! Quiero finalizar mi pedido en Cuervo Rojo 🦅✨\n\n` +
        `*Productos:*\n${resumenProductos}\n` +
        `*Total a pagar:* $${totalFinal}\n\n` +
        `Adjunto mi comprobante de transferencia/depósito.`
    );

    const enlaceWhatsApp = `https://wa.me/2218187281?text=${mensajeWhatsApp}`;

    // Cambiamos el contenido del modal por las instrucciones de depósito
    contenedorLista.innerHTML = `
        <div class="instrucciones-pago" style="animation: fadeIn 0.5s ease;">
            <p style="margin-bottom: 15px; color: var(--texto-claro);">Para completar tu orden, realiza tu transferencia o depósito OXXO con los siguientes datos:</p>
            
            <div style="background-color: #0d0d0d; padding: 15px; border-radius: 6px; border: 1px dashed var(--rojo-carmesi); margin-bottom: 20px; font-family: 'Montserrat', sans-serif; font-size: 0.9rem;">
                <p><strong>Banco:</strong> Banorte </p>
                <p style="margin-top: 5px;"><strong>Titular:</strong> Ana Karen Mora Perez</p>
                <p style="margin-top: 5px;"><strong>Número de Tarjeta:</strong> 4915 6631 2297 3507</p>
                <p style="margin-top: 5px;"><strong>CLABE Interbancaria:</strong> 0725 8001 3040 1058 40</p>
                <p style="margin-top: 10px; color: var(--rojo-brillante); font-weight: bold;">Monto Exacto: $${totalFinal}</p>
            </div>

            <p style="font-size: 0.85rem; color: var(--texto-oscuro); margin-bottom: 15px; font-style: italic;">Una vez hecho el pago, da clic abajo para enviarme tu comprobante y coordinar tu entrega personal en Puebla.</p>
            
            <a href="${enlaceWhatsApp}" target="_blank" class="btn-pagar" style="display: block; text-align: center; text-decoration: none; background-color: #25d366; border-color: #25d366; color: white;">
                📱 Enviar Comprobante por WhatsApp
            </a>
            
            <button id="btn-regresar-carrito" style="background: none; border: none; color: var(--texto-oscuro); cursor: pointer; display: block; margin: 15px auto 0 auto; text-decoration: underline; font-size: 0.85rem;">
                Volver al carrito
            </button>
        </div>
    `;

    btnPagar.style.display = 'none';
    document.querySelector('.total-carrito').style.display = 'none';

    document.getElementById('btn-regresar-carrito').addEventListener('click', () => {
        btnPagar.style.display = 'block';
        document.querySelector('.total-carrito').style.display = 'block';
        renderizarCarrito();
    });
});
