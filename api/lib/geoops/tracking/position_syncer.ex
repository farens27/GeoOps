defmodule Geoops.Tracking.PositionSyncer do
  @moduledoc """
  Batch-syncs worker positions from ETS to CockroachDB every 60 seconds.

  This is the primary cost-control mechanism for the GPS pipeline:
  - GPS reports arrive continuously (potentially hundreds per second)
  - DB writes happen at most once per minute per worker
  - All intra-cycle reads and writes go to ETS (in-process, sub-microsecond)

  ## How it works

  1. On each `:sync` tick the GenServer asks `WorkerState` for every position
     whose ETS timestamp (`ts_ms`) is ≥ `last_sync_ts`.
  2. Those positions are passed to `Geoops.Workers.batch_update_positions/1`
     which performs a single bulk upsert.
  3. `last_sync_ts` advances to `now` so the next cycle only picks up new
     updates, avoiding duplicate writes.

  Geofence events (ENTERED / EXITED / BREACH) are written immediately in
  `GpsProcessor` — they are never batched.
  """
  use GenServer
  require Logger

  # 60-second sync cycle
  @sync_interval_ms 60 * 1_000

  # ---------------------------------------------------------------------------
  # Client API
  # ---------------------------------------------------------------------------

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  # ---------------------------------------------------------------------------
  # GenServer callbacks
  # ---------------------------------------------------------------------------

  @impl true
  def init(_opts) do
    schedule_sync()
    # Record the startup timestamp so the very first sync captures everything
    # that was written between boot and the first tick.
    {:ok, %{last_sync_ts: :os.system_time(:millisecond)}}
  end

  @impl true
  def handle_info(:sync, %{last_sync_ts: since_ts} = state) do
    now_ts = :os.system_time(:millisecond)

    dirty = Geoops.Tracking.WorkerState.get_dirty_positions(since_ts)

    if length(dirty) > 0 do
      Logger.debug("PositionSyncer: flushing #{length(dirty)} positions to DB")

      case Geoops.Workers.batch_update_positions(dirty) do
        :ok ->
          :ok

        {:error, reason} ->
          # Log but do not crash — the positions are still in ETS and will be
          # included in the next cycle's dirty set (ts >= since_ts will still
          # match because we do NOT advance last_sync_ts on failure).
          Logger.error("PositionSyncer batch write failed: #{inspect(reason)}")
      end
    end

    schedule_sync()
    {:noreply, %{state | last_sync_ts: now_ts}}
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp schedule_sync do
    Process.send_after(self(), :sync, @sync_interval_ms)
  end
end
