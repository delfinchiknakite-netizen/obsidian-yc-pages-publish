# Auth: экспортируй IAM-токен перед apply:
#   export YC_TOKEN=$(yc iam create-token)
# (или используй service_account_key_file — см. README)
provider "yandex" {
  cloud_id  = var.cloud_id
  folder_id = var.folder_id
}
