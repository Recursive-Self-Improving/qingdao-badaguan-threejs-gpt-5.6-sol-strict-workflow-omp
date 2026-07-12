export interface DisposableResource {
  dispose(): void;
}

export type ResourceGroup = string;

export interface ResourceRegistryCounts {
  readonly resources: number;
  readonly references: number;
  readonly groups: number;
  readonly disposed: number;
}

export interface ResourceRegistryEntrySnapshot {
  readonly group: ResourceGroup;
  readonly references: number;
}

export interface ResourceRegistryResourceSnapshot {
  readonly references: number;
  readonly groups: readonly ResourceRegistryEntrySnapshot[];
}

export interface ResourceRegistrySnapshot extends ResourceRegistryCounts {
  readonly entries: readonly ResourceRegistryResourceSnapshot[];
}

interface ResourceEntry {
  references: number;
  readonly groups: Map<ResourceGroup, number>;
}

/** Owns disposable resources shared by one or more scene-lifecycle groups. */
export class ResourceRegistry {
  private readonly entries = new Map<DisposableResource, ResourceEntry>();
  private readonly groups = new Map<ResourceGroup, Map<DisposableResource, number>>();
  private readonly disposedResources = new WeakSet<object>();
  private referenceCount = 0;
  private disposedCount = 0;

  register<T extends DisposableResource>(resource: T, group: ResourceGroup): T {
    if (this.disposedResources.has(resource)) {
      throw new Error('Cannot register a resource that this registry already disposed.');
    }
    if (this.entries.has(resource)) {
      throw new Error('Resource is already registered; use acquire() to add an owner.');
    }

    const owners = new Map<ResourceGroup, number>();
    owners.set(group, 1);
    this.entries.set(resource, { references: 1, groups: owners });
    this.addGroupReference(group, resource);
    this.referenceCount += 1;
    return resource;
  }

  acquire<T extends DisposableResource>(resource: T, group: ResourceGroup): T {
    const entry = this.entries.get(resource);
    if (entry === undefined) {
      throw new Error('Cannot acquire an unregistered resource.');
    }

    entry.references += 1;
    entry.groups.set(group, (entry.groups.get(group) ?? 0) + 1);
    this.addGroupReference(group, resource);
    this.referenceCount += 1;
    return resource;
  }

  release(resource: DisposableResource, group: ResourceGroup): boolean {
    const entry = this.entries.get(resource);
    const groupReferences = entry?.groups.get(group) ?? 0;
    if (entry === undefined || groupReferences === 0) {
      return false;
    }

    this.removeReferences(resource, entry, group, 1);
    return true;
  }

  disposeGroup(group: ResourceGroup): number {
    const ownedResources = this.groups.get(group);
    if (ownedResources === undefined) return 0;

    const releases = Array.from(ownedResources.entries());
    let disposed = 0;
    const errors: unknown[] = [];
    for (const [resource, references] of releases) {
      const entry = this.entries.get(resource);
      if (entry === undefined) continue;
      try {
        if (this.removeReferences(resource, entry, group, references)) disposed += 1;
      } catch (error) {
        disposed += 1;
        errors.push(error);
      }
    }
    this.throwDisposalErrors(errors, `Failed to dispose resource group "${group}".`);
    return disposed;
  }

  disposeAll(): number {
    const resources = Array.from(this.entries.keys());
    let disposed = 0;
    const errors: unknown[] = [];

    this.entries.clear();
    this.groups.clear();
    this.referenceCount = 0;
    for (const resource of resources) {
      try {
        this.disposeResource(resource);
      } catch (error) {
        errors.push(error);
      }
      disposed += 1;
    }
    this.throwDisposalErrors(errors, 'Failed to dispose all resources.');
    return disposed;
  }

  getCounts(): ResourceRegistryCounts {
    return {
      resources: this.entries.size,
      references: this.referenceCount,
      groups: this.groups.size,
      disposed: this.disposedCount,
    };
  }

  getSnapshot(): ResourceRegistrySnapshot {
    const entries: ResourceRegistryResourceSnapshot[] = [];
    for (const entry of this.entries.values()) {
      entries.push({
        references: entry.references,
        groups: Array.from(entry.groups, ([group, references]) => ({ group, references })),
      });
    }
    return { ...this.getCounts(), entries };
  }

  private addGroupReference(group: ResourceGroup, resource: DisposableResource): void {
    let resources = this.groups.get(group);
    if (resources === undefined) {
      resources = new Map<DisposableResource, number>();
      this.groups.set(group, resources);
    }
    resources.set(resource, (resources.get(resource) ?? 0) + 1);
  }

  private removeReferences(
    resource: DisposableResource,
    entry: ResourceEntry,
    group: ResourceGroup,
    references: number,
  ): boolean {
    const groupReferences = entry.groups.get(group);
    if (groupReferences === undefined || references > groupReferences) {
      throw new Error('Resource ownership accounting is inconsistent.');
    }

    const remainingGroupReferences = groupReferences - references;
    if (remainingGroupReferences === 0) entry.groups.delete(group);
    else entry.groups.set(group, remainingGroupReferences);

    const groupResources = this.groups.get(group);
    if (groupResources !== undefined) {
      const remainingResourceReferences = (groupResources.get(resource) ?? 0) - references;
      if (remainingResourceReferences <= 0) groupResources.delete(resource);
      else groupResources.set(resource, remainingResourceReferences);
      if (groupResources.size === 0) this.groups.delete(group);
    }

    entry.references -= references;
    this.referenceCount -= references;
    if (entry.references !== 0) return false;

    this.entries.delete(resource);
    this.disposeResource(resource);
    return true;
  }

  private disposeResource(resource: DisposableResource): void {
    this.disposedResources.add(resource);
    this.disposedCount += 1;
    resource.dispose();
  }

  private throwDisposalErrors(errors: readonly unknown[], message: string): void {
    if (errors.length !== 0) throw new AggregateError(errors, message);
  }
}
