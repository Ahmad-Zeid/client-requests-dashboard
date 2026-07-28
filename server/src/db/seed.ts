import { fileURLToPath } from 'node:url';

import { logger } from '../lib/logger.js';
import { closePool, pool } from './pool.js';

type SeedRow = {
  clientName: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'new' | 'in_progress' | 'done';
  /** Hours before now that the request came in. */
  ageHours: number;
  /**
   * Hours before now that it last changed. Defaults to `ageHours` — a request nobody
   * has touched since it arrived. Setting it separately is what creates a *stalled*
   * row: started long ago, untouched since.
   */
  touchedHoursAgo?: number;
};

/**
 * Representative workload for the dashboard — the kind of request an ecommerce
 * operations team actually receives, spread across all three statuses and all three
 * priorities so every UI state has something to render.
 *
 * The ages are chosen, not random. They deliberately produce one request of each
 * attention kind — an unacknowledged high-priority one, two that have simply sat
 * there, and one that was started and then forgotten — because a queue where nothing
 * is overdue does not demonstrate a tool built to catch things going quiet.
 */
const SEED_ROWS: SeedRow[] = [
  {
    clientName: 'Cedar Grove Grocers',
    title: 'Checkout abandons on the shipping step for cash-on-delivery orders',
    description:
      'Roughly a third of COD carts drop at shipping selection. Suspect the governorate dropdown fails to load rates for addresses outside Beirut.',
    priority: 'high',
    status: 'new',
    ageHours: 30,
  },
  {
    clientName: 'Marina Pharmacy',
    title: 'Duplicate orders created when customers double-tap Pay',
    description:
      'Two identical orders land seconds apart. The Pay button stays enabled while the payment request is in flight.',
    priority: 'high',
    status: 'in_progress',
    ageHours: 50, touchedHoursAgo: 6,
  },
  {
    clientName: 'Olive & Thyme',
    title: 'Arabic translations missing on the returns page',
    description: 'The returns policy and the RMA form both fall back to English when the locale is set to ar.',
    priority: 'medium',
    status: 'new',
    ageHours: 8,
  },
  {
    clientName: 'Nadim Electronics',
    title: 'Bulk-upload 400 new SKUs before the season launch',
    description: 'Supplier sent a spreadsheet with inconsistent column names. Needs mapping and a dry-run import.',
    priority: 'high',
    status: 'in_progress',
    ageHours: 210, touchedHoursAgo: 140,
  },
  {
    clientName: 'Rawi Books',
    title: 'Product images load slowly on 3G connections',
    description: 'Hero images ship at 2400px with no responsive variants. Largest Contentful Paint sits above four seconds.',
    priority: 'medium',
    status: 'new',
    ageHours: 26,
  },
  {
    clientName: 'Byblos Home',
    title: 'Sync inventory between the storefront and the warehouse sheet',
    description: 'Stock counts drift within a day of a manual edit, so oversells reach customers before anyone notices.',
    priority: 'high',
    status: 'in_progress',
    ageHours: 60, touchedHoursAgo: 20,
  },
  {
    clientName: 'Sable Athletics',
    title: 'Discount codes rejected on mobile Safari',
    description: 'The coupon field posts but the cart total never updates. Reproducible on iOS 18, not on Chrome.',
    priority: 'medium',
    status: 'new',
    ageHours: 96,
  },
  {
    clientName: 'Terra Verde Organics',
    title: 'Set up the abandoned-cart email flow',
    description: 'Three-step sequence at one hour, one day, and three days, with a single discount on the final send.',
    priority: 'medium',
    status: 'done',
    ageHours: 120, touchedHoursAgo: 30,
  },
  {
    clientName: 'Lumen Optics',
    title: 'Analytics stopped recording purchase events',
    description: 'Purchase conversions went to zero after the theme update. Add-to-cart still fires correctly.',
    priority: 'high',
    status: 'done',
    ageHours: 140, touchedHoursAgo: 44,
  },
  {
    clientName: 'Beit Textiles',
    title: 'Monthly revenue report is off by shipping tax',
    description: 'The export sums line items before tax while the dashboard sums after, so the two never reconcile.',
    priority: 'medium',
    status: 'in_progress',
    ageHours: 90, touchedHoursAgo: 40,
  },
  {
    clientName: 'Cedar Grove Grocers',
    title: 'Add a size guide to product pages',
    description: 'One shared table for apparel, opened in a dialog from the variant picker.',
    priority: 'low',
    status: 'new',
    ageHours: 100,
  },
  {
    clientName: 'Marina Pharmacy',
    title: 'Automate invoice generation for wholesale accounts',
    description: 'Currently produced by hand each Friday. Should emit a PDF per account and email it on a schedule.',
    priority: 'low',
    status: 'new',
    ageHours: 4,
  },
  {
    clientName: 'Sable Athletics',
    title: 'Migrate the storefront to a headless front end',
    description: 'Scoping only for now — inventory of custom theme work, third-party apps, and current traffic.',
    priority: 'low',
    status: 'done',
    ageHours: 300, touchedHoursAgo: 96,
  },
  {
    clientName: 'Rawi Books',
    title: 'Restore the gift-wrap option at checkout',
    description: 'Disappeared after the last app update. The setting is still enabled in the admin.',
    priority: 'medium',
    status: 'done',
    ageHours: 200, touchedHoursAgo: 90,
  },
];

/**
 * The people in the seeded history.
 *
 * Two of them, alternating, so the trail's `actor` column visibly carries information
 * rather than repeating one name down the page. `ops@example.com` is the account the
 * demo signs in as, so some of the past work reads as yours and some as a colleague's.
 */
const ACTORS = ['ops@example.com', 'rana@example.com'] as const;

/**
 * The trail a row must have had to be in the state it is in.
 *
 * Seeding the current status without the events that produced it would leave the
 * detail pane showing an empty history for every request but the ones created during
 * the demo — and it would put `version` out of step with the number of writes, which
 * is the number the conflict check compares. So the transitions are replayed here:
 * each one gets a timestamp between the request's arrival and its last change, and
 * the row's version is set to match how many writes it took to get there.
 */
function trailFor(row: SeedRow): Array<{
  type: 'created' | 'status_changed';
  fromStatus: SeedRow['status'] | null;
  toStatus: SeedRow['status'];
  hoursAgo: number;
}> {
  const lastTouch = row.touchedHoursAgo ?? row.ageHours;

  const trail: ReturnType<typeof trailFor> = [
    { type: 'created', fromStatus: null, toStatus: 'new', hoursAgo: row.ageHours },
  ];

  if (row.status === 'in_progress' || row.status === 'done') {
    // A request that reached `done` was started somewhere between arriving and being
    // finished; one that is still in progress was started at its last change.
    const startedAt = row.status === 'done' ? (row.ageHours + lastTouch) / 2 : lastTouch;
    trail.push({
      type: 'status_changed',
      fromStatus: 'new',
      toStatus: 'in_progress',
      hoursAgo: startedAt,
    });
  }

  if (row.status === 'done') {
    trail.push({
      type: 'status_changed',
      fromStatus: 'in_progress',
      toStatus: 'done',
      hoursAgo: lastTouch,
    });
  }

  return trail;
}

export async function seed(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    // `cascade` because request_events references these rows; without it Postgres
    // refuses rather than quietly leaving orphaned history behind.
    await client.query('truncate table client_requests cascade');

    let actorIndex = 0;

    for (const row of SEED_ROWS) {
      const trail = trailFor(row);

      const { rows: inserted } = await client.query<{ id: string }>(
        `insert into client_requests
           (client_name, title, description, priority, status, version, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6,
                 now() - ($7 * interval '1 hour'),
                 now() - ($8 * interval '1 hour'))
         returning id`,
        [
          row.clientName,
          row.title,
          row.description,
          row.priority,
          row.status,
          trail.length, // one write per event: create, then one per transition
          row.ageHours,
          row.touchedHoursAgo ?? row.ageHours,
        ],
      );

      const id = inserted[0]!.id;

      for (const [index, event] of trail.entries()) {
        await client.query(
          `insert into request_events
             (request_id, type, from_status, to_status, actor, version, created_at)
           values ($1, $2, $3, $4, $5, $6, now() - ($7 * interval '1 hour'))`,
          [
            id,
            event.type,
            event.fromStatus,
            event.toStatus,
            ACTORS[(actorIndex + index) % ACTORS.length],
            index + 1,
            event.hoursAgo,
          ],
        );
      }

      actorIndex += 1;
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
