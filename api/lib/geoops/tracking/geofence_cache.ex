defmodule Geoops.Tracking.GeofenceCache do
  @moduledoc """
  In-memory geofence cache using ETS.

  Loads all active geofences on startup, refreshes every 5 minutes.
  Eliminates per-GPS-report DB reads for geofence checks — the whole
  geofence dataset lives in a public ETS table so any process can read
  it without going through the GenServer.

  ## ETS table layout
      {@table, id :: binary(), geofence :: map()}

  ## Usage
      GeofenceCache.get_all()   # returns [%{id: ..., polygon_coords: ..., ...}]
      GeofenceCache.refresh()   # force immediate reload (e.g. after a DB write)
  """
  use GenServer
  require Logger

  @table :geofences_cache

  # 5-minute refresh cycle
  @refresh_interval_ms 5 * 60 * 1_000

  # ---------------------------------------------------------------------------
  # Client API
  # ---------------------------------------------------------------------------

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @doc "Return all cached geofences as a list of maps."
  def get_all do
    case :ets.info(@table) do
      :undefined ->
        []

      _ ->
        :ets.tab2list(@table)
        |> Enum.map(fn {_id, geofence} -> geofence end)
    end
  end

  @doc """
  Force an immediate cache refresh.

  Call this after any create/update/delete on the geofences table so the
  in-memory state stays consistent without waiting for the next 5-minute tick.
  """
  def refresh do
    GenServer.cast(__MODULE__, :refresh)
  end

  # ---------------------------------------------------------------------------
  # GenServer callbacks
  # ---------------------------------------------------------------------------

  @impl true
  def init(_opts) do
    # Create a public ETS table so every process can call get_all/0 without
    # touching the GenServer process (critical for GPS throughput).
    :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])

    # Trigger an immediate load; we use send/2 instead of a direct call so
    # the supervisor receives {:ok, pid} before any DB work happens.
    send(self(), :load)

    {:ok, %{}}
  end

  @impl true
  def handle_info(:load, state) do
    load_geofences()
    schedule_refresh()
    {:noreply, state}
  end

  @impl true
  def handle_cast(:refresh, state) do
    load_geofences()
    {:noreply, state}
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp load_geofences do
    try do
      geofences = Geoops.Geofences.get_geofences_for_cache()

      # Atomic swap: clear then repopulate.  Because ETS :set allows concurrent
      # reads, a reader might see the empty table for a very brief window, but
      # that is acceptable — it simply returns no geofences for that one check.
      :ets.delete_all_objects(@table)
      Enum.each(geofences, fn g -> :ets.insert(@table, {g.id, g}) end)

      Logger.info("GeofenceCache loaded #{length(geofences)} geofences")
    rescue
      e ->
        Logger.warning("GeofenceCache refresh failed: #{inspect(e)}")
    end
  end

  defp schedule_refresh do
    Process.send_after(self(), :load, @refresh_interval_ms)
  end
end
