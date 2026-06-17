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

unless Repo.get_by(User, username: "admin") do
  Repo.insert!(%User{
    username: "admin",
    password_hash: Pbkdf2.hash_pwd_salt("password123"),
    role: "ADMIN"
  })
  IO.puts "Created default admin user."
end
