// Server-owned catalogue: client-submitted names/prices/specifications are never trusted.
// Before enabling orders, reconcile this catalogue against live inventory and approved commercial terms.
export const PLANS = Object.freeze({
  'HXC-V02': Object.freeze({ name: 'HXC-V02', ramGb: 2, vcpu: 2, diskGb: 30, monthlyUsd: 2.29 }),
  'HXC-V04': Object.freeze({ name: 'HXC-V04', ramGb: 4, vcpu: 2, diskGb: 60, monthlyUsd: 3.49 }),
  'HXC-V06': Object.freeze({ name: 'HXC-V06', ramGb: 6, vcpu: 3, diskGb: 90, monthlyUsd: 4.69 }),
  'HXC-V08': Object.freeze({ name: 'HXC-V08', ramGb: 8, vcpu: 4, diskGb: 120, monthlyUsd: 5.69 }),
  'HXC-V12': Object.freeze({ name: 'HXC-V12', ramGb: 12, vcpu: 4, diskGb: 160, monthlyUsd: 7.99 }),
  'HXC-V16': Object.freeze({ name: 'HXC-V16', ramGb: 16, vcpu: 6, diskGb: 220, monthlyUsd: 9.99 }),
  'HXC-V24': Object.freeze({ name: 'HXC-V24', ramGb: 24, vcpu: 8, diskGb: 320, monthlyUsd: 13.49 }),
  'HXC-V32': Object.freeze({ name: 'HXC-V32', ramGb: 32, vcpu: 10, diskGb: 400, monthlyUsd: 15.49 }),
  'HXC-V48': Object.freeze({ name: 'HXC-V48', ramGb: 48, vcpu: 12, diskGb: 600, monthlyUsd: 17.99 }),
  'HXC-V64': Object.freeze({ name: 'HXC-V64', ramGb: 64, vcpu: 16, diskGb: 800, monthlyUsd: 21.99 })
});
export function getPlan(key) { return Object.hasOwn(PLANS, key) ? PLANS[key] : null; }