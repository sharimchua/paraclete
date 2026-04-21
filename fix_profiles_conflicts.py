import re

def resolve_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Regex to find git conflict blocks
    # We will favor the `origin/main` changes for the useEffect dependencies (editName, editDesc, etc)
    # but since our code changes were mainly UI related, we'll keep the `origin/main` code as it just adds dependencies to useEffect

    # We'll just replace the whole conflict block with the bottom half
    pattern = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> origin/main', re.DOTALL)
    content = pattern.sub(r'\2', content)

    with open(filepath, 'w') as f:
        f.write(content)

resolve_file("src/renderer/src/components/GroupProfile.tsx")
resolve_file("src/renderer/src/components/PersonProfile.tsx")
resolve_file("src/renderer/src/components/AvatarSelector.tsx")
