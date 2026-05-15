import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import 'dotenv/config';

// Importar rutas
import clientesRoutes from './routes/clientes.routes.js';
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
import gruposFacturasRoutes from './routes/grupos-facturas.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Rutas
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/configuraciones', configuracionesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/Categorias', categoriasRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/servicios', serviciosRoutes);
app.use('/api/prendas', prendasRoutes);
app.use('/api/prendasservicios', prendasServiciosRoutes);
app.use('/api/categoriasgastos', categoriasGastosRoutes);
app.use('/api/gastos', gastosRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/grupos-facturas', gruposFacturasRoutes);

app.get('/', (_req, res) => {
  res.json({ message: 'Backend Lavanderia Rodriguez activo.' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Aceptando peticiones solo desde: ${process.env.FRONTEND_URL}`);
});