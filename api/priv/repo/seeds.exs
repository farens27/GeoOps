# Script for populating the database. You can run it as:
#
#     mix run priv/repo/seeds.exs
#
# Inside the script, you can read and write to any of your
# repositories directly:
#
#     Geoops.Repo.insert!(%Geoops.SomeSchema{})
#
# We recommend using the bang functions (`insert!`, `update!`
# and so on) as they will fail if something goes wrong.

alias Geoops.Repo
alias Geoops.Accounts.User
alias Geoops.Geofences.Geofence
alias Geoops.Workers.Worker

# Create Admin User
unless Repo.get_by(User, username: "admin") do
  Repo.insert!(%User{
    username: "admin",
    password_hash: Pbkdf2.hash_pwd_salt("password123"),
    role: "ADMIN"
  })
  IO.puts "Created default admin user."
end

# Seed Geofences
# 1. Main Work Zone (Work Zone)
unless Repo.get_by(Geofence, name: "Main Logistics Hub") do
  Repo.insert!(%Geofence{
    name: "Main Logistics Hub",
    description: "Primary operational workspace for logistics team.",
    zone_type: "WORK_ZONE",
    color: "#10b981", # Green for safe work zone
    is_active: true,
    polygon_coords: [
      [-122.425, 37.770],
      [-122.410, 37.770],
      [-122.410, 37.780],
      [-122.425, 37.780],
      [-122.425, 37.770]
    ]
  })
  IO.puts "Created Main Logistics Hub geofence."
end

# 2. Restricted Zone (Danger area inside the work zone)
unless Repo.get_by(Geofence, name: "Danger Zone (Transformer Room)") do
  Repo.insert!(%Geofence{
    name: "Danger Zone (Transformer Room)",
    description: "High voltage machinery. STRICTLY RESTRICTED.",
    zone_type: "RESTRICTED",
    color: "#ef4444", # Red for restricted danger zone
    is_active: true,
    polygon_coords: [
      [-122.420, 37.773],
      [-122.417, 37.773],
      [-122.417, 37.776],
      [-122.420, 37.776],
      [-122.420, 37.773]
    ]
  })
  IO.puts "Created Danger Zone geofence."
end

# 3. Safety Checkpoint Zone (Safety Zone)
unless Repo.get_by(Geofence, name: "Safety Assembly Area") do
  Repo.insert!(%Geofence{
    name: "Safety Assembly Area",
    description: "Designated safety muster checkpoint.",
    zone_type: "SAFETY",
    color: "#3b82f6", # Blue for safety area
    is_active: true,
    polygon_coords: [
      [-122.415, 37.772],
      [-122.412, 37.772],
      [-122.412, 37.775],
      [-122.415, 37.775],
      [-122.415, 37.772]
    ]
  })
  IO.puts "Created Safety Assembly Area geofence."
end

# Seed Workers
unless Repo.get_by(Worker, name: "John Operator") do
  Repo.insert!(%Worker{
    name: "John Operator",
    role: "Field Technician",
    team: "Logistics",
    phone: "+15550199",
    status: "ACTIVE",
    latitude: 37.7749,
    longitude: -122.4194,
    last_seen: DateTime.utc_now() |> DateTime.truncate(:second)
  })
  IO.puts "Created John Operator worker."
end

unless Repo.get_by(Worker, name: "Jane Safety") do
  Repo.insert!(%Worker{
    name: "Jane Safety",
    role: "Safety Supervisor",
    team: "Compliance",
    phone: "+15550200",
    status: "ACTIVE",
    latitude: 37.7749,
    longitude: -122.4194,
    last_seen: DateTime.utc_now() |> DateTime.truncate(:second)
  })
  IO.puts "Created Jane Safety worker."
end
