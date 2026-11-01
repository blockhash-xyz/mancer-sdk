#!/usr/bin/env node
/**
 * The published bin (dist/cli.js): `mancer-mcp` over stdio, or `mancer-mcp serve` over Streamable HTTP.
 */
import { main } from './main'

await main()
