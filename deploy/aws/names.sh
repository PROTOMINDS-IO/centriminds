# shellcheck shell=bash
# shellcheck disable=SC2034  # variables are used by the scripts that source this
# Names of what deploy/aws/docker-compose.yml creates on the instance, for
# the scripts that work on it outside Compose. remote-deploy.sh installs
# this file as /opt/centriminds/names.sh, where backup.sh and the commands
# of restore.sh read it. Change these together with docker-compose.yml.

# <project name>_<volume key>: Compose prefixes volumes with the project.
DATA_VOLUME=centriminds_centriminds_data
BACKEND_IMAGE=centriminds-backend:aws
BACKEND_CONTAINER=centriminds-backend
FRONTEND_CONTAINER=centriminds-frontend
