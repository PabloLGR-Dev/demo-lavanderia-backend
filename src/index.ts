import express from 'express';
<<<<<<< HEAD
import cors from 'cors';
import 'dotenv/config';

// Importar rutas
import clientesRoutes from './routes/clientes.routes.js';
import rolesRoutes from './routes/roles.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';
import configuracionesRoutes from './routes/configuraciones.routes.js';
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import categoriasRoutes from './routes/categorias.routes.js';
import productosRoutes from './routes/productos.routes.js';
import serviciosRoutes from './routes/servicios.routes.js';
import prendasRoutes from './routes/prendas.routes.js';
import prendasServiciosRoutes from './routes/prendas-servicios.routes.js';
import categoriasGastosRoutes from './routes/categorias-gastos.routes.js';
import gastosRoutes from './routes/gastos.routes.js';
import facturasRoutes from './routes/facturas.routes.js';
import pagosRoutes from './routes/pagos.routes.js';
import reportesRoutes from './routes/reportes.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración estricta de CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3001', // Solo permite peticiones de esta URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Headers permitidos (necesitas Authorization para el Bearer token)
  credentials: true // Importante si en el futuro usas cookies
};

app.use(cors(corsOptions));
app.use(express.json());

// Rutas
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/users', usuariosRoutes); // Ojo: tu frontend lo llama 'users', no 'usuarios'
app.use('/api/configuraciones', configuracionesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/Categorias', categoriasRoutes); // Ojo a la mayúscula para coincidir con tu API_ENDPOINTS en React
app.use('/api/productos', productosRoutes);
app.use('/api/servicios', serviciosRoutes);
app.use('/api/prendas', prendasRoutes);
app.use('/api/prendasservicios', prendasServiciosRoutes);
app.use('/api/categoriasgastos', categoriasGastosRoutes); // Ojo a las minúsculas del endpoint en tu frontend
app.use('/api/gastos', gastosRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/reportes', reportesRoutes);

app.get('/', (req, res) => {
  res.json({ message: '¡El backend de Lavandería Rodriguez está vivo y conectado!' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Aceptando peticiones solo desde: ${process.env.FRONTEND_URL}`);
=======
import clientesRouter from './routes/clientes.js';
import estadosRouter from './routes/estados.js';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 8000;

app.use(express.json());

app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}))

app.use('/api/clientes', clientesRouter)
app.use('/api/estados', estadosRouter)

app.get('/', (req, res) => {
  res.send('Hello, welcome to Lavanderia Rodriguez API!')
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
>>>>>>> a2605236b8d969cf5ab6119465d4c37c5d6a9a54
});