defmodule Geoops.Tracking.GpsEvent do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, Ecto.ULID, autogenerate: true}
  @derive {Jason.Encoder,
           only: [:id, :worker_id, :geofence_id, :event_type, :latitude, :longitude, :detected_at]}

  schema "geo_events" do
    field :worker_id, Ecto.ULID
    field :geofence_id, Ecto.ULID
    field :event_type, :string
    field :latitude, :float
    field :longitude, :float
    field :detected_at, :utc_datetime
  end

  def changeset(event, attrs) do
    event
    |> cast(attrs, [:worker_id, :geofence_id, :event_type, :latitude, :longitude, :detected_at])
    |> validate_required([:worker_id, :geofence_id, :event_type, :latitude, :longitude])
    |> validate_inclusion(:event_type, ["ENTERED", "EXITED", "BREACH"])
  end
end
