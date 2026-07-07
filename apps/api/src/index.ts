import { Hono } from 'hono'

const app = new Hono<{ Bindings: { ASSETS: Fetcher } }>()

app.get('/api/health', (c) => c.text('Hello from api'))

export default app
