import { CampusRole, InvoiceStatus, PaymentStatus, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  AuthenticationError,
  authErrorResponse,
  assertSameOrigin,
  requireSession,
} from "@/lib/auth";
import {
  financeRoles,
  readJsonObject,
  requiredText,
  studentRoles,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createSslCommerzSession } from "@/lib/sslcommerz";

const paymentInitiatorRoles: CampusRole[] = [...studentRoles, CampusRole.PARENT];
const checkoutLifetimeMs = 30 * 60 * 1000;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(paymentInitiatorRoles);
    const input = await readJsonObject(request);
    const requestedInvoiceId = requiredText(input.invoiceId, "Invoice", 1, 100);
    const customerPhone = requiredText(input.customerPhone, "Phone number", 7, 20);
    if (!/^\+?[0-9 ()-]{7,20}$/.test(customerPhone)) {
      throw new AuthenticationError("Enter a valid phone number.", 400);
    }
    const customerAddress = requiredText(input.customerAddress, "Billing address", 3, 100);
    const customerCity = requiredText(input.customerCity, "City", 2, 50);
    const customerPostcode = requiredText(input.customerPostcode, "Postal code", 2, 20);
    const customerCountry = requiredText(input.customerCountry, "Country", 2, 50);
    const requestedInstitutionId = session.membership.institutionId;
    const createdTransactionId = `CH${randomBytes(12).toString("hex").toUpperCase()}`;
    const expiresAt = new Date(Date.now() + checkoutLifetimeMs);
    const now = new Date();

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceRecord = await tx.invoice.findFirst({
        where: {
          id: requestedInvoiceId,
          institutionId: requestedInstitutionId,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] },
          ...(session.membership.role === CampusRole.PARENT
            ? {
                student: {
                  studentGuardians: {
                    some: {
                      guardianId: session.userId,
                      verifiedAt: { not: null },
                    },
                  },
                },
              }
            : { studentId: session.userId }),
        },
        include: { student: { select: { id: true } } },
      });
      if (!invoiceRecord) {
        throw new AuthenticationError("Open invoice not found for your account.", 404);
      }
      if (invoiceRecord.currency !== "BDT") {
        throw new AuthenticationError("SSLCommerz checkout currently supports BDT invoices only.", 400);
      }
      const amount = invoiceRecord.totalAmount.sub(invoiceRecord.paidAmount);
      if (
        amount.lessThan(10) ||
        amount.greaterThan(500000) ||
        amount.decimalPlaces() > 2
      ) {
        throw new AuthenticationError(
          "SSLCommerz accepts invoice balances from BDT 10.00 to BDT 500,000.00.",
          400,
        );
      }
      const lock = await tx.invoice.updateMany({
        where: {
          id: invoiceRecord.id,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] },
          OR: [
            { checkoutLock: null },
            { checkoutExpiresAt: { lte: now } },
          ],
        },
        data: { checkoutLock: createdTransactionId, checkoutExpiresAt: expiresAt },
      });
      if (lock.count !== 1) {
        throw new AuthenticationError(
          "Another checkout is already active for this invoice. Please retry shortly.",
          409,
        );
      }
      await tx.paymentTransaction.create({
        data: {
          invoiceId: invoiceRecord.id,
          initiatorId: session.userId,
          transactionId: createdTransactionId,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          currency: invoiceRecord.currency,
          expiresAt,
        },
      });
      await tx.auditEvent.create({
        data: {
          institutionId: requestedInstitutionId,
          actorId: session.userId,
          action: "finance.payment.checkout_started",
          entityType: "PaymentTransaction",
          entityId: createdTransactionId,
          metadata: {
            transactionId: createdTransactionId,
            invoiceNumber: invoiceRecord.invoiceNumber,
            amount: amount.toFixed(2),
            currency: invoiceRecord.currency,
          },
        },
      });
      return {
        invoice: invoiceRecord,
        amount: new Prisma.Decimal(amount.toFixed(2)),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    let checkoutUrl: string;
    try {
      checkoutUrl = await createSslCommerzSession({
        transactionId: createdTransactionId,
        amount: invoice.amount.toFixed(2),
        currency: invoice.invoice.currency,
        invoiceNumber: invoice.invoice.invoiceNumber,
        customerName: session.user.name,
        customerEmail: session.user.email,
        customerPhone,
        customerAddress,
        customerCity,
        customerPostcode,
        customerCountry,
      });
    } catch (error) {
      await prisma.$transaction([
        prisma.paymentTransaction.updateMany({
          where: { transactionId: createdTransactionId, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED },
        }),
        prisma.invoice.updateMany({
          where: { id: requestedInvoiceId, checkoutLock: createdTransactionId },
          data: { checkoutLock: null, checkoutExpiresAt: null },
        }),
      ]);
      throw error;
    }
    return Response.json({ checkoutUrl });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function GET() {
  try {
    const session = await requireSession([...financeRoles]);
    const transactions = await prisma.paymentTransaction.findMany({
      where: { invoice: { institutionId: session.membership.institutionId } },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            student: { select: { id: true, name: true, email: true } },
          },
        },
        payment: { include: { receipt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ transactions });
  } catch (error) {
    return authErrorResponse(error);
  }
}
