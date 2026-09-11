import { ethereum } from "@graphprotocol/graph-ts";
import {
  EscrowCreated,
  DeliverableSubmitted,
  EscrowResolved,
  EscrowRefunded,
} from "../generated/ArbiterEscrow/ArbiterEscrow";
import { Escrow, EscrowEvent } from "../generated/schema";

function eventId(event: ethereum.Event, suffix: string): string {
  return event.transaction.hash.toHex() + ":" + event.logIndex.toString() + ":" + suffix;
}

function recordEvent(event: ethereum.Event, deal: Escrow, kind: string, hash: string | null = null, hasApproved: boolean = false, approved: boolean = false): void {
  const record = new EscrowEvent(eventId(event, kind));
  record.deal = deal.id;
  record.kind = kind;
  record.transactionHash = event.transaction.hash;
  record.blockNumber = event.block.number;
  record.timestamp = event.block.timestamp;
  if (hash !== null) record.hash = hash;
  if (hasApproved) record.approved = approved;
  record.save();
}

export function handleEscrowCreated(event: EscrowCreated): void {
  const deal = new Escrow(event.params.dealId.toHex());
  deal.dealId = event.params.dealId;
  deal.buyer = event.params.buyer;
  deal.seller = event.params.seller;
  deal.token = event.params.token;
  deal.amount = event.params.amount;
  deal.criteriaHash = event.params.criteriaHash;
  deal.deadline = event.params.deadline;
  deal.state = "Funded";
  deal.createdTransactionHash = event.transaction.hash;
  deal.createdBlockNumber = event.block.number;
  deal.createdAt = event.block.timestamp;
  deal.updatedAt = event.block.timestamp;
  deal.save();
  recordEvent(event, deal, "CREATED");
}

export function handleDeliverableSubmitted(event: DeliverableSubmitted): void {
  const deal = Escrow.load(event.params.dealId.toHex());
  if (deal === null) return;
  deal.deliverableHash = event.params.deliverableHash;
  deal.state = "Submitted";
  deal.submittedTransactionHash = event.transaction.hash;
  deal.submittedBlockNumber = event.block.number;
  deal.updatedAt = event.block.timestamp;
  deal.save();
  recordEvent(event, deal, "SUBMITTED", event.params.deliverableHash);
}

export function handleEscrowResolved(event: EscrowResolved): void {
  const deal = Escrow.load(event.params.dealId.toHex());
  if (deal === null) return;
  deal.approved = event.params.approved;
  deal.state = event.params.approved ? "ResolvedSuccess" : "ResolvedRefund";
  deal.verdictReasoningHash = event.params.verdictReasoningHash;
  deal.resolvedTransactionHash = event.transaction.hash;
  deal.resolvedBlockNumber = event.block.number;
  deal.updatedAt = event.block.timestamp;
  deal.save();
  recordEvent(event, deal, "RESOLVED", event.params.verdictReasoningHash, true, event.params.approved);
}

export function handleEscrowRefunded(event: EscrowRefunded): void {
  const deal = Escrow.load(event.params.dealId.toHex());
  if (deal === null) return;
  deal.state = "ExpiredRefund";
  deal.updatedAt = event.block.timestamp;
  deal.save();
  recordEvent(event, deal, "REFUNDED", event.params.reason);
}
