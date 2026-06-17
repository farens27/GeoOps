defmodule Geoops.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      GeoopsWeb.Telemetry,
      Geoops.Repo,
      {DNSCluster, query: Application.get_env(:geoops, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Geoops.PubSub},

      # -----------------------------------------------------------------------
      # GPS Tracking subsystem
      # Boot order matters:
      #   1. WorkerState — creates ETS tables (plain Task, no GenServer)
      #   2. GeofenceCache — GenServer that fills :geofences_cache ETS table
      #   3. PositionSyncer — GenServer that flushes positions to CockroachDB
      # -----------------------------------------------------------------------

      # 1. Initialise ETS tables for live worker positions and zone membership.
      #    WorkerState has no GenServer — init/0 returns :ok directly.
      #    We call it here instead of as a child so the supervisor owns the table.

      # 2. Load all active geofences into ETS; auto-refreshes every 5 minutes.
      Geoops.Tracking.GeofenceCache,

      # 3. Batch-flush dirty ETS positions to DB every 60 seconds.
      Geoops.Tracking.PositionSyncer,

      # Start to serve requests — kept last so tracking is ready before
      # any WebSocket connections arrive.
      GeoopsWeb.Endpoint
    ]

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Geoops.Supervisor]
    
    # Initialize ETS tables before children that rely on them start
    Geoops.Tracking.WorkerState.init()
    
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    GeoopsWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
