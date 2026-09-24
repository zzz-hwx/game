// Injected by the platform at deployment; never create or package _qoder locally.
import { storage } from './_qoder/storage.mjs';
import { createHandler } from './handler.ts';

Deno.serve(createHandler(storage));
