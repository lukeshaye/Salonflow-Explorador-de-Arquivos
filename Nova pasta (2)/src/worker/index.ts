import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
import {
  exchangeCodeForSessionToken,
  getOAuthRedirectUrl,
  authMiddleware,
  deleteSession,
  MOCHA_SESSION_TOKEN_COOKIE_NAME,
} from "@getmocha/users-service/backend";

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use("*", cors({
  origin: ["http://localhost:5173", "https://localhost:5173"],
  credentials: true,
}));

// Auth endpoints
app.get('/api/oauth/google/redirect_url', async (c) => {
  const redirectUrl = await getOAuthRedirectUrl('google', {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });

  return c.json({ redirectUrl }, 200);
});

app.post("/api/sessions", async (c) => {
  const body = await c.req.json();

  if (!body.code) {
    return c.json({ error: "No authorization code provided" }, 400);
  }

  const sessionToken = await exchangeCodeForSessionToken(body.code, {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });

  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
    maxAge: 60 * 24 * 60 * 60, // 60 days
  });

  return c.json({ success: true }, 200);
});

app.get("/api/users/me", authMiddleware, async (c) => {
  return c.json(c.get("user"));
});

app.get('/api/logout', async (c) => {
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);

  if (typeof sessionToken === 'string') {
    await deleteSession(sessionToken, {
      apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
      apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
    });
  }

  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    sameSite: 'none',
    secure: true,
    maxAge: 0,
  });

  return c.json({ success: true }, 200);
});

// Dashboard endpoints
app.get("/api/dashboard/kpis", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const today = new Date().toISOString().split('T')[0];

  // Ganhos do dia
  const dailyEarnings = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM financial_entries 
    WHERE user_id = ? AND type = 'receita' AND entry_date = ?
  `).bind(user.id, today).first();

  // Agendamentos do dia
  const dailyAppointments = await c.env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM appointments 
    WHERE user_id = ? AND DATE(appointment_date) = ?
  `).bind(user.id, today).first();

  // Ticket médio do dia
  const avgTicket = await c.env.DB.prepare(`
    SELECT COALESCE(AVG(price), 0) as avg
    FROM appointments 
    WHERE user_id = ? AND DATE(appointment_date) = ?
  `).bind(user.id, today).first();

  return c.json({
    dailyEarnings: dailyEarnings?.total || 0,
    dailyAppointments: dailyAppointments?.count || 0,
    avgTicket: avgTicket?.avg || 0
  });
});

app.get("/api/dashboard/today-appointments", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const today = new Date().toISOString().split('T')[0];

  const appointments = await c.env.DB.prepare(`
    SELECT id, client_name, service, price, professional, appointment_date, is_confirmed
    FROM appointments 
    WHERE user_id = ? AND DATE(appointment_date) = ?
    ORDER BY appointment_date ASC
  `).bind(user.id, today).all();

  return c.json(appointments.results);
});

app.get("/api/dashboard/weekly-earnings", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const weeklyData = await c.env.DB.prepare(`
    SELECT 
      entry_date,
      COALESCE(SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END), 0) as earnings
    FROM financial_entries 
    WHERE user_id = ? 
      AND entry_date >= DATE('now', '-6 days')
      AND entry_date <= DATE('now')
    GROUP BY entry_date
    ORDER BY entry_date ASC
  `).bind(user.id).all();

  return c.json(weeklyData.results);
});

app.get("/api/dashboard/popular-services", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const services = await c.env.DB.prepare(`
    SELECT 
      service,
      COUNT(*) as count
    FROM appointments 
    WHERE user_id = ? 
      AND appointment_date >= DATE('now', '-30 days')
    GROUP BY service
    ORDER BY count DESC
    LIMIT 5
  `).bind(user.id).all();

  return c.json(services.results);
});

app.get("/api/dashboard/professional-performance", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const performance = await c.env.DB.prepare(`
    SELECT 
      professional,
      COUNT(*) as count
    FROM appointments 
    WHERE user_id = ? 
      AND appointment_date >= DATE('now', '-30 days')
    GROUP BY professional
    ORDER BY count DESC
  `).bind(user.id).all();

  return c.json(performance.results);
});

// Clients endpoints
app.get("/api/clients", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const clients = await c.env.DB.prepare(`
    SELECT id, name, phone, email, notes, created_at, updated_at
    FROM clients 
    WHERE user_id = ?
    ORDER BY name ASC
  `).bind(user.id).all();

  return c.json(clients.results);
});

app.post("/api/clients", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const body = await c.req.json();
  
  const result = await c.env.DB.prepare(`
    INSERT INTO clients (user_id, name, phone, email, notes)
    VALUES (?, ?, ?, ?, ?)
  `).bind(user.id, body.name, body.phone || null, body.email || null, body.notes || null).run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

app.put("/api/clients/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const clientId = c.req.param('id');
  const body = await c.req.json();
  
  await c.env.DB.prepare(`
    UPDATE clients 
    SET name = ?, phone = ?, email = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(body.name, body.phone || null, body.email || null, body.notes || null, clientId, user.id).run();

  return c.json({ success: true });
});

app.delete("/api/clients/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const clientId = c.req.param('id');
  
  await c.env.DB.prepare(`
    DELETE FROM clients WHERE id = ? AND user_id = ?
  `).bind(clientId, user.id).run();

  return c.json({ success: true });
});

// Financial endpoints
app.get("/api/financial/kpis", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format

  // Monthly revenue
  const revenueResult = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM financial_entries 
    WHERE user_id = ? AND type = 'receita' AND strftime('%Y-%m', entry_date) = ?
  `).bind(user.id, currentMonth).first();

  // Monthly expenses
  const expensesResult = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM financial_entries 
    WHERE user_id = ? AND type = 'despesa' AND strftime('%Y-%m', entry_date) = ?
  `).bind(user.id, currentMonth).first();

  const monthlyRevenue = Number(revenueResult?.total) || 0;
  const monthlyExpenses = Number(expensesResult?.total) || 0;
  const netProfit = monthlyRevenue - monthlyExpenses;

  return c.json({
    monthlyRevenue,
    monthlyExpenses,
    netProfit
  });
});

app.get("/api/financial/entries", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const entries = await c.env.DB.prepare(`
    SELECT id, description, amount, type, entry_type, entry_date, created_at
    FROM financial_entries 
    WHERE user_id = ?
    ORDER BY entry_date DESC, created_at DESC
    LIMIT 100
  `).bind(user.id).all();

  return c.json(entries.results);
});

app.post("/api/financial/entries", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const body = await c.req.json();
  
  const result = await c.env.DB.prepare(`
    INSERT INTO financial_entries (user_id, description, amount, type, entry_type, entry_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(user.id, body.description, body.amount, body.type, body.entry_type, body.entry_date).run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

app.put("/api/financial/entries/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const entryId = c.req.param('id');
  const body = await c.req.json();
  
  await c.env.DB.prepare(`
    UPDATE financial_entries 
    SET description = ?, amount = ?, type = ?, entry_type = ?, entry_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(body.description, body.amount, body.type, body.entry_type, body.entry_date, entryId, user.id).run();

  return c.json({ success: true });
});

app.delete("/api/financial/entries/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const entryId = c.req.param('id');
  
  await c.env.DB.prepare(`
    DELETE FROM financial_entries WHERE id = ? AND user_id = ?
  `).bind(entryId, user.id).run();

  return c.json({ success: true });
});

// Products endpoints
app.get("/api/products", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const products = await c.env.DB.prepare(`
    SELECT id, name, description, price, quantity, image_url, created_at, updated_at
    FROM products 
    WHERE user_id = ?
    ORDER BY name ASC
  `).bind(user.id).all();

  return c.json(products.results);
});

app.post("/api/products", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const body = await c.req.json();
  
  const result = await c.env.DB.prepare(`
    INSERT INTO products (user_id, name, description, price, quantity, image_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(user.id, body.name, body.description || null, body.price, body.quantity || 0, body.image_url || null).run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

app.put("/api/products/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const productId = c.req.param('id');
  const body = await c.req.json();
  
  await c.env.DB.prepare(`
    UPDATE products 
    SET name = ?, description = ?, price = ?, quantity = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(body.name, body.description || null, body.price, body.quantity || 0, body.image_url || null, productId, user.id).run();

  return c.json({ success: true });
});

app.delete("/api/products/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const productId = c.req.param('id');
  
  await c.env.DB.prepare(`
    DELETE FROM products WHERE id = ? AND user_id = ?
  `).bind(productId, user.id).run();

  return c.json({ success: true });
});

// Business settings endpoints
app.get("/api/settings/business", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const settings = await c.env.DB.prepare(`
    SELECT id, day_of_week, start_time, end_time
    FROM business_settings 
    WHERE user_id = ?
    ORDER BY day_of_week ASC
  `).bind(user.id).all();

  return c.json(settings.results);
});

app.post("/api/settings/business", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const body = await c.req.json();
  
  // Delete existing settings for this day
  await c.env.DB.prepare(`
    DELETE FROM business_settings WHERE user_id = ? AND day_of_week = ?
  `).bind(user.id, body.day_of_week).run();
  
  // Insert new settings
  const result = await c.env.DB.prepare(`
    INSERT INTO business_settings (user_id, day_of_week, start_time, end_time)
    VALUES (?, ?, ?, ?)
  `).bind(user.id, body.day_of_week, body.start_time, body.end_time).run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

app.get("/api/settings/exceptions", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const exceptions = await c.env.DB.prepare(`
    SELECT id, exception_date, start_time, end_time, description
    FROM business_exceptions 
    WHERE user_id = ?
    ORDER BY exception_date ASC
  `).bind(user.id).all();

  return c.json(exceptions.results);
});

app.post("/api/settings/exceptions", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const body = await c.req.json();
  
  const result = await c.env.DB.prepare(`
    INSERT INTO business_exceptions (user_id, exception_date, start_time, end_time, description)
    VALUES (?, ?, ?, ?, ?)
  `).bind(user.id, body.exception_date, body.start_time || null, body.end_time || null, body.description).run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

app.delete("/api/settings/exceptions/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const exceptionId = c.req.param('id');
  
  await c.env.DB.prepare(`
    DELETE FROM business_exceptions WHERE id = ? AND user_id = ?
  `).bind(exceptionId, user.id).run();

  return c.json({ success: true });
});

// Appointments endpoints
app.get("/api/appointments", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const appointments = await c.env.DB.prepare(`
    SELECT id, client_name, service, price, professional, appointment_date, is_confirmed
    FROM appointments 
    WHERE user_id = ? AND appointment_date > datetime('now')
    ORDER BY appointment_date ASC
  `).bind(user.id).all();

  return c.json(appointments.results);
});

app.post("/api/appointments", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const body = await c.req.json();
  
  const result = await c.env.DB.prepare(`
    INSERT INTO appointments (user_id, client_name, service, price, professional, appointment_date, is_confirmed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(user.id, body.client_name, body.service, body.price, body.professional, body.appointment_date, body.is_confirmed || false).run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

app.put("/api/appointments/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const appointmentId = c.req.param('id');
  const body = await c.req.json();
  
  await c.env.DB.prepare(`
    UPDATE appointments 
    SET client_name = ?, service = ?, price = ?, professional = ?, appointment_date = ?, is_confirmed = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(body.client_name, body.service, body.price, body.professional, body.appointment_date, body.is_confirmed || false, appointmentId, user.id).run();

  return c.json({ success: true });
});

app.delete("/api/appointments/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const appointmentId = c.req.param('id');
  
  await c.env.DB.prepare(`
    DELETE FROM appointments WHERE id = ? AND user_id = ?
  `).bind(appointmentId, user.id).run();

  return c.json({ success: true });
});

export default app;
