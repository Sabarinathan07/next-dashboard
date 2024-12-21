import { Pool } from 'pg';
import {
    CustomerField,
    CustomersTableType,
    InvoiceForm,
    InvoicesTable,
    LatestInvoiceRaw,
    Revenue,
} from './definitions';
import { formatCurrency } from './utils';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export async function fetchRevenue() {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query<Revenue>('SELECT * FROM revenue');
            return res.rows;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch revenue data.');
    }
}

export async function fetchLatestInvoices() {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query<LatestInvoiceRaw>(`
                SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
                FROM invoices
                JOIN customers ON invoices.customer_id = customers.id
                ORDER BY invoices.date DESC
                LIMIT 5
            `);
            const latestInvoices = res.rows.map((invoice) => ({
                ...invoice,
                amount: formatCurrency(invoice.amount),
            }));
            return latestInvoices;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch the latest invoices.');
    }
}

export async function fetchCardData() {
    try {
        const client = await pool.connect();
        try {
            const invoiceCountPromise = client.query(
                'SELECT COUNT(*) FROM invoices'
            );
            const customerCountPromise = client.query(
                'SELECT COUNT(*) FROM customers'
            );
            const invoiceStatusPromise = client.query(`
                SELECT
                    SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
                    SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
                FROM invoices
            `);

            const data = await Promise.all([
                invoiceCountPromise,
                customerCountPromise,
                invoiceStatusPromise,
            ]);

            const numberOfInvoices = Number(data[0].rows[0].count ?? '0');
            const numberOfCustomers = Number(data[1].rows[0].count ?? '0');
            const totalPaidInvoices = formatCurrency(
                data[2].rows[0].paid ?? '0'
            );
            const totalPendingInvoices = formatCurrency(
                data[2].rows[0].pending ?? '0'
            );

            return {
                numberOfCustomers,
                numberOfInvoices,
                totalPaidInvoices,
                totalPendingInvoices,
            };
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch card data.');
    }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
    query: string,
    currentPage: number
) {
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;

    try {
        const client = await pool.connect();
        try {
            const res = await client.query<InvoicesTable>(
                `
                SELECT
                    invoices.id,
                    invoices.amount,
                    invoices.date,
                    invoices.status,
                    customers.name,
                    customers.email,
                    customers.image_url
                FROM invoices
                JOIN customers ON invoices.customer_id = customers.id
                WHERE
                    customers.name ILIKE $1 OR
                    customers.email ILIKE $1 OR
                    invoices.amount::text ILIKE $1 OR
                    invoices.date::text ILIKE $1 OR
                    invoices.status ILIKE $1
                ORDER BY invoices.date DESC
                LIMIT $2 OFFSET $3
            `,
                [`%${query}%`, ITEMS_PER_PAGE, offset]
            );

            return res.rows;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch invoices.');
    }
}

export async function fetchInvoicesPages(query: string) {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query(
                `
                SELECT COUNT(*)
                FROM invoices
                JOIN customers ON invoices.customer_id = customers.id
                WHERE
                    customers.name ILIKE $1 OR
                    customers.email ILIKE $1 OR
                    invoices.amount::text ILIKE $1 OR
                    invoices.date::text ILIKE $1 OR
                    invoices.status ILIKE $1
            `,
                [`%${query}%`]
            );

            const totalPages = Math.ceil(
                Number(res.rows[0].count) / ITEMS_PER_PAGE
            );
            return totalPages;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch total number of invoices.');
    }
}

export async function fetchInvoiceById(id: string) {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query<InvoiceForm>(
                `
                SELECT
                    invoices.id,
                    invoices.customer_id,
                    invoices.amount,
                    invoices.status
                FROM invoices
                WHERE invoices.id = $1
            `,
                [id]
            );

            const invoice = res.rows.map((invoice) => ({
                ...invoice,
                // Convert amount from cents to dollars
                amount: invoice.amount / 100,
            }));

            return invoice[0];
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch invoice.');
    }
}

export async function fetchCustomers() {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query<CustomerField>(`
                SELECT
                    id,
                    name
                FROM customers
                ORDER BY name ASC
            `);

            return res.rows;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch all customers.');
    }
}

export async function fetchFilteredCustomers(query: string) {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query<CustomersTableType>(
                `
                SELECT
                    customers.id,
                    customers.name,
                    customers.email,
                    customers.image_url,
                    COUNT(invoices.id) AS total_invoices,
                    SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
                    SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
                FROM customers
                LEFT JOIN invoices ON customers.id = invoices.customer_id
                WHERE
                    customers.name ILIKE $1 OR
                    customers.email ILIKE $1
                GROUP BY customers.id, customers.name, customers.email, customers.image_url
                ORDER BY customers.name ASC
            `,
                [`%${query}%`]
            );

            const customers = res.rows.map((customer) => ({
                ...customer,
                total_pending: formatCurrency(customer.total_pending),
                total_paid: formatCurrency(customer.total_paid),
            }));

            return customers;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch customer table.');
    }
}
