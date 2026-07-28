import { fileURLToPath } from 'node:url';

import { logger } from '../lib/logger.js';
import { closePool, pool } from './pool.js';

type SeedRow = {
  clientName: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'new' | 'in_progress' | 'done';
};

/**
 * Representative workload for the dashboard — the kind of request an ecommerce
 * operations team actually receives, spread across all three statuses and all
 * three priorities so every UI state has something to render.
 */
const SEED_ROWS: SeedRow[] = [
  {
    clientName: 'Cedar Grove Grocers',
    title: 'Checkout abandons on the shipping step for cash-on-delivery orders',
    description:
      'Roughly a third of COD carts drop at shipping selection. Suspect the governorate dropdown fails to load rates for addresses outside Beirut.',
    priority: 'high',
    status: 'new',
  },
  {
    clientName: 'Marina Pharmacy',
    title: 'Duplicate orders created when customers double-tap Pay',
    description:
      'Two identical orders land seconds apart. The Pay button stays enabled while the payment request is in flight.',
    priority: 'high',
    status: 'in_progress',
  },
  {
    clientName: 'Olive & Thyme',
    title: 'Arabic translations missing on the returns page',
    description: 'The returns policy and the RMA form both fall back to English when the locale is set to ar.',
    priority: 'medium',
    status: 'new',
  },
  {
    clientName: 'Nadim Electronics',
    title: 'Bulk-upload 400 new SKUs before the season launch',
    description: 'Supplier sent a spreadsheet with inconsistent column names. Needs mapping and a dry-run import.',
    priority: 'high',
    status: 'in_progress',
  },
  {
    clientName: 'Rawi Books',
    title: 'Product images load slowly on 3G connections',
    description: 'Hero images ship at 2400px with no responsive variants. Largest Contentful Paint sits above four seconds.',
    priority: 'medium',
    status: 'new',
  },
  {
    clientName: 'Byblos Home',
    title: 'Sync inventory between the storefront and the warehouse sheet',
    description: 'Stock counts drift within a day of a manual edit, so oversells reach customers before anyone notices.',
    priority: 'high',
    status: 'in_progress',
  },
  {
    clientName: 'Sable Athletics',
    title: 'Discount codes rejected on mobile Safari',
    description: 'The coupon field posts but the cart total never updates. Reproducible on iOS 18, not on Chrome.',
    priority: 'medium',
    status: 'new',
  },
  {
    clientName: 'Terra Verde Organics',
    title: 'Set up the abandoned-cart email flow',
    description: 'Three-step sequence at one hour, one day, and three days, with a single discount on the final send.',
    priority: 'medium',
    status: 'done',
  },
  {
    clientName: 'Lumen Optics',
    title: 'Analytics stopped recording purchase events',
    description: 'Purchase conversions went to zero after the theme update. Add-to-cart still fires correctly.',
    priority: 'high',
    status: 'done',
  },
  {
    clientName: 'Beit Textiles',
    title: 'Monthly revenue report is off by shipping tax',
    description: 'The export sums line items before tax while the dashboard sums after, so the two never reconcile.',
    priority: 'medium',
    status: 'in_progress',
  },
  {
    clientName: 'Cedar Grove Grocers',
    title: 'Add a size guide to product pages',
    description: 'One shared table for apparel, opened in a dialog from the variant picker.',
    priority: 'low',
    status: 'new',
  },
  {
    clientName: 'Marina Pharmacy',
    title: 'Automate invoice generation for wholesale accounts',
    description: 'Currently produced by hand each Friday. Should emit a PDF per account and email it on a schedule.',
    priority: 'low',
    status: 'new',
  },
  {
    clientName: 'Sable Athletics',
    title: 'Migrate the storefront to a headless front end',
    description: 'Scoping only for now — inventory of custom theme work, third-party apps, and current traffic.',
    priority: 'low',
    status: 'done',
  },
  {
    clientName: 'Rawi Books',
    title: 'Restore the gift-wrap option at checkout',
    description: 'Disappeared after the last app update. The setting is still enabled in the admin.',
    priority: 'medium',
    status: 'done',
  },
];

export async function seed(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query('truncate table client_requests');

    for (const [index, row] of SEED_ROWS.entries()) {
      await client.query(
        `insert into client_requests
           (client_name, title, description, priority, status, created_at, updated_at)
         values ($1, $2, $3, $4, $5, now() - ($6 * interval '1 hour'), now() - ($6 * interval '1 hour'))`,
        [
          row.clientName,
          row.title,
          row.description,
          row.priority,
          row.status,
          // Stagger created_at so the default "newest first" sort has something to do.
          index * 7,
        ],
      );
    }

    await client.query('commit');
    logger.info({ count: SEED_ROWS.length }, 'Seeded client requests');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (error) => {
      logger.error({ err: error }, 'Seed failed');
      await closePool().catch(() => {});
      process.exit(1);
    });
}
