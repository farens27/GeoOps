defmodule Geoops.Geofences.Geofence do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, Ecto.ULID, autogenerate: true}
  @derive {Jason.Encoder,
           only: [:id, :name, :description, :zone_type, :color, :is_active, :polygon_coords, :created_at, :updated_at]}

  schema "geofences" do
    field :name, :string
    field :description, :string
    field :zone_type, :string, default: "CUSTOM"
    field :color, :string, default: "#ef4444"
    field :is_active, :boolean, default: true
    # Store polygon as JSON array of [lng, lat] pairs for easy in-memory use
    # The SQL migration uses PostGIS GEOMETRY but we serialize to/from JSON
    field :polygon_coords, {:array, {:array, :float}}

    timestamps(inserted_at: :created_at, updated_at: :updated_at)
  end

  def changeset(geofence, attrs) do
    geofence
    |> cast(attrs, [:name, :description, :zone_type, :color, :is_active, :polygon_coords])
    |> validate_required([:name, :zone_type, :polygon_coords])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_inclusion(:zone_type, ["RESTRICTED", "WORK_ZONE", "SAFETY", "CUSTOM"])
    |> validate_polygon_coords()
  end

  defp validate_polygon_coords(changeset) do
    validate_change(changeset, :polygon_coords, fn :polygon_coords, coords ->
      if length(coords) >= 3 do
        []
      else
        [polygon_coords: "must have at least 3 coordinates"]
      end
    end)
  end
end
