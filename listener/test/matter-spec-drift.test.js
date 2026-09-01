import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as clusters from '@matter/main/clusters';
import { specAnchors } from '../src/matter-normalize.js';
import { readFileSync } from 'node:fs';

/**
 * Matter spec drift guard.
 *
 * matter-normalize.js hardcodes cluster and attribute IDs. Matter is young and
 * still adding clusters and revising them — matter.js moved from spec 1.4.2 to
 * 1.6.0 across a single minor version. If a revision renames an attribute or
 * renumbers a cluster, the hardcoded table would keep "working" while silently
 * reading the wrong attribute, or nothing at all.
 *
 * So rather than trusting the constants, these tests check every one of them
 * against matter.js's own cluster model at the installed version. A dependency
 * bump that breaks an assumption fails here, in CI, instead of in someone's
 * event log.
 */
describe('Matter spec drift', () => {
  const anchors = specAnchors();

  test('the table is not empty (a silent no-op would pass everything below)', () => {
    assert.ok(anchors.length >= 20, `expected the full table, got ${anchors.length}`);
  });

  for (const a of anchors) {
    test(`${a.cluster}.${a.attribute} -> ${a.characteristic} still matches the spec model`, () => {
      const cluster = clusters[a.cluster]?.Complete;
      assert.ok(cluster, `matter.js no longer exports a cluster named ${a.cluster}`);

      assert.equal(
        cluster.id, a.clusterId,
        `${a.cluster} cluster id moved: table says 0x${a.clusterId.toString(16)}, matter.js says 0x${Number(cluster.id).toString(16)}`,
      );

      const attr = cluster.attributes?.[a.attribute];
      assert.ok(attr, `${a.cluster} no longer has an attribute named "${a.attribute}"`);

      assert.equal(
        attr.id, a.attributeId,
        `${a.cluster}.${a.attribute} id moved: table says 0x${a.attributeId.toString(16)}, matter.js says 0x${Number(attr.id).toString(16)}`,
      );
    });
  }
});

/**
 * The controller API we are built on is deprecated upstream and scheduled for
 * removal. This is a countdown, not a correctness check: it fails the moment
 * the installed matter.js no longer provides it, so the migration is forced by
 * a red test rather than discovered by a production boot failure.
 */
describe('matter.js controller API lifecycle', () => {
  test('CommissioningController still exists at the installed version', async () => {
    const m = await import('@project-chip/matter.js');
    assert.equal(
      typeof m.CommissioningController, 'function',
      'CommissioningController is gone — matter.js deprecated it in 0.17 and scheduled removal for 0.19. '
      + 'The Matter integration must migrate to the new controller API before this dependency moves again.',
    );
  });

  test('the pinned major.minor is recorded, so a bump is a deliberate act', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const spec = pkg.dependencies['@project-chip/matter.js'];
    // Both matter packages must move together — they share a version line.
    assert.equal(spec, pkg.dependencies['@matter/main'], '@matter/main and matter.js must stay on the same version');
    // 0.19 is where the legacy controller API is removed. Reaching it without
    // migrating first would break commissioning at runtime.
    const minor = Number(spec.replace(/^[^0-9]*/, '').split('.')[1]);
    assert.ok(
      minor < 19,
      `matter.js ${spec} removes the legacy CommissioningController. Migrate the controller before bumping.`,
    );
  });
});

/**
 * Boot path.
 *
 * The spec-drift checks above verify that matter.js still EXPORTS what we
 * import. That is not the same as the controller still being able to start,
 * and the difference cost a crash-looping beta: matter.js 0.17 made
 * StorageService.location getter-only, so `storageService.location = path`
 * threw on boot. Every test passed, because no test ever ran the boot path.
 *
 * These exercise the real matter.js, not a mock.
 */
describe('Matter controller boot path', () => {
  test('storage path is applied through the environment and reads back', async () => {
    const { Environment } = await import('@matter/main');
    const { configureStorage } = await import('../src/matter-controller.js');

    // Environment.default deliberately, because that is what initController
    // uses: a fresh `new Environment()` has no filesystem storage driver
    // registered and reports "(off filesystem)", so it would not exercise the
    // code path that actually broke. Restored afterwards.
    const env = Environment.default;
    const previous = env.vars.get('storage.path');
    const path = '/tmp/homechronicle-matter-storage-test';
    try {
      assert.equal(configureStorage(env, path), path);
    } finally {
      if (previous !== undefined) env.vars.set('storage.path', previous);
    }
  });

  test('a storage path that does not take is a loud failure, not a silent one', async () => {
    const { Environment } = await import('@matter/main');
    const { configureStorage } = await import('../src/matter-controller.js');

    // An environment with no filesystem driver cannot adopt a path — it
    // reports "(off filesystem)". That stands in for any future revision that
    // ignores the setting. Sending the fabric to the wrong directory loses
    // every commissioned node, so this must throw rather than carry on.
    await assert.rejects(
      async () => configureStorage(new Environment('no-filesystem'), '/tmp/homechronicle-never-applied'),
      /storage path not applied/,
    );
  });
});
