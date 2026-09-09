# Arbitera The Graph subgraph

This is the standard subgraph source for the `ArbiterEscrow` lifecycle. It indexes on-chain facts only: escrow participants, token amount, lifecycle state, transaction/block metadata, deliverable hash, and settlement outcome/hash. Prisma remains the source for the off-chain AI Judge prompt, raw response, reasoning, canonical verdict, and deterministic `verdictHash`.

The ABI contains the event definitions required by the mappings. Replace `{{ARBITER_ESCROW_ADDRESS}}` and the network in `subgraph.yaml`, install the subgraph package dependencies, then run:

```powershell
npm.cmd install
npm.cmd run codegen --prefix subgraph
npm.cmd run build --prefix subgraph
```

Deployment is intentionally left to the operator because no production subgraph endpoint or hosted-service credentials are committed here.
