// This is a template for how your logic will change.
// In a real Vite app, you'd usually use a small Express server or 
// Vite's built-in middleware to run this code.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getTrades = async () => {
  return await prisma.trade.findMany({
    orderBy: { date: 'desc' }
  });
};

export const saveTrade = async (tradeData: any) => {
  return await prisma.trade.create({
    data: tradeData
  });
};