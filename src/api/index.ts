import { Hono } from "hono";

// Create a Hono app for custom API endpoints
const app = new Hono();

// The GraphQL API is automatically generated from the schema at /graphql

// You can add custom REST endpoints here if needed
// Example:
// app.get("/hello", (c) => c.json({ message: "Hello from Ponder!" }));

export default app;
