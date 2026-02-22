<script lang="ts">
  import type McpToolsPlugin from "$/main";
  import { FULL_LOGGER_FILENAME, loadDependenciesArray } from "$/shared";
  import { Notice } from "obsidian";
  import { dirname } from "path";
  import { onMount } from "svelte";
  import {
    removeFromClaudeConfig,
    updateClaudeConfig,
  } from "../services/config";
  import { installMcpServer } from "../services/install";
  import { getInstallationStatus } from "../services/status";
  import { uninstallServer } from "../services/uninstall";
  import type { InstallationStatus } from "../types";
  import { openFolder } from "../utils/openFolder";

  export let plugin: McpToolsPlugin;

  // Dependencies and API key status
  const deps = loadDependenciesArray(plugin);

  // Installation status
  let status: InstallationStatus = {
    state: "not installed",
    versions: {},
  };
  onMount(async () => {
    status = await getInstallationStatus(plugin);
  });

  // Handle installation
  async function handleInstall() {
    try {
      const apiKey = await plugin.getLocalRestApiKey();
      if (!apiKey) {
        throw new Error("Local REST API key is not configured");
      }

      status = { ...status, state: "installing" };
      const installPath = await installMcpServer(plugin);

      // Update Claude config
      await updateClaudeConfig(plugin, installPath.path, apiKey);

      status = await getInstallationStatus(plugin);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Installation failed";
      status = { ...status, state: "error", error: message };
      new Notice(message);
    }
  }

  // Handle uninstall
  async function handleUninstall() {
    try {
      status = { ...status, state: "installing" };
      await uninstallServer(plugin);
      await removeFromClaudeConfig();
      status = { ...status, state: "not installed" };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Uninstallation failed";
      status = {
        ...status,
        state: "error",
        error: message,
      };
      new Notice(message);
    }
  }
</script>

<div class="status-card">
  <h3>MCP Server Status</h3>

  {#if status.state === "no api key"}
    <div class="status-header">
      <span class="status-dot status-error"></span>
      <span class="status-label">Missing API Key</span>
    </div>
    <div class="status-detail">Please configure the Local REST API plugin</div>
  {:else if status.state === "not installed"}
    <div class="status-header">
      <span class="status-dot status-error"></span>
      <span class="status-label">Not Installed</span>
    </div>
    <dl class="version-info">
      {#if status.versions.plugin}
        <dt>Plugin version</dt>
        <dd>{status.versions.plugin}</dd>
      {/if}
    </dl>
    <div class="status-actions">
      <button on:click={handleInstall}>Install server</button>
    </div>
  {:else if status.state === "installing"}
    <div class="status-header">
      <span class="status-dot status-warning"></span>
      <span class="status-label">Installing…</span>
    </div>
  {:else if status.state === "installed"}
    <div class="status-header">
      <span class="status-dot status-success"></span>
      <span class="status-label">Installed</span>
    </div>
    <dl class="version-info">
      {#if status.versions.server}
        <dt>Server version</dt>
        <dd>{status.versions.server}</dd>
      {/if}
      {#if status.versions.plugin}
        <dt>Plugin version</dt>
        <dd>{status.versions.plugin}</dd>
      {/if}
      {#if status.path}
        <dt>Binary path</dt>
        <dd class="path-value">{status.path}</dd>
      {/if}
    </dl>
    <div class="status-actions">
      <button on:click={handleUninstall}>Uninstall</button>
    </div>
  {:else if status.state === "outdated"}
    <div class="status-header">
      <span class="status-dot status-warning"></span>
      <span class="status-label">Update Available</span>
    </div>
    <dl class="version-info">
      {#if status.versions.server}
        <dt>Server version</dt>
        <dd>{status.versions.server}</dd>
      {/if}
      {#if status.versions.plugin}
        <dt>Plugin version</dt>
        <dd>{status.versions.plugin}</dd>
      {/if}
      {#if status.path}
        <dt>Binary path</dt>
        <dd class="path-value">{status.path}</dd>
      {/if}
    </dl>
    <div class="status-actions">
      <button on:click={handleInstall}>Update</button>
    </div>
  {:else if status.state === "uninstalling"}
    <div class="status-header">
      <span class="status-dot status-warning"></span>
      <span class="status-label">Uninstalling…</span>
    </div>
  {:else if status.state === "error"}
    <div class="status-header">
      <span class="status-dot status-error"></span>
      <span class="status-label">Error</span>
    </div>
    <div class="status-detail">{status.error}</div>
  {/if}
</div>

<div class="dependencies">
  <h3>Dependencies</h3>

  {#each $deps as dep (dep.id)}
    <div class="dependency-item">
      {#if dep.installed}
        ✅ {dep.name} is installed
      {:else}
        ❌
        {dep.name}
        {dep.required ? "(Required)" : "(Optional)"}
        {#if dep.url}<a href={dep.url} target="_blank">How to install?</a>{/if}
      {/if}
    </div>
  {/each}
</div>

<div class="links">
  <h3>Resources</h3>

  {#if status.path}
    <div class="link-item">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <a on:click={() => status.dir && openFolder(status.dir)}>
        Server install folder
      </a>
    </div>
  {/if}

  <div class="link-item">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <a on:click={() => openFolder(dirname(FULL_LOGGER_FILENAME))}>
      Server log folder
    </a>
  </div>

  <div class="link-item">
    <a
      href="https://github.com/jacksteamdev/obsidian-mcp-tools"
      target="_blank"
    >
      GitHub repository
    </a>
  </div>
</div>

<style>
  .status-card {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 12px 16px;
    background: var(--background-secondary);
    margin-bottom: 1em;
  }

  .status-card h3 {
    margin-top: 0;
    margin-bottom: 8px;
  }

  .status-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-success {
    background-color: var(--text-success);
  }

  .status-warning {
    background-color: var(--text-warning);
  }

  .status-error {
    background-color: var(--text-error);
  }

  .status-label {
    font-weight: 600;
  }

  .status-detail {
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .version-info {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0 0 8px 18px;
    font-size: var(--font-ui-small);
  }

  .version-info dt {
    color: var(--text-muted);
  }

  .version-info dd {
    margin: 0;
    font-family: var(--font-monospace);
  }

  .path-value {
    word-break: break-all;
  }

  .status-actions {
    display: flex;
    justify-content: flex-end;
  }

  .dependency-item {
    margin-bottom: 0.5em;
  }

  .link-item {
    margin-bottom: 0.5em;
  }
</style>
