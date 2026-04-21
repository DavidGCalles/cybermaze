import math


class Grid:
    def __init__(self, map_matrix, cell_size, margin_left=0, margin_top=0):
        self.map = map_matrix
        self.cell_size = cell_size
        self.margin_left = margin_left
        self.margin_top = margin_top

    def is_valid(self, r, c):
        return r >= 0 and r < len(self.map) and c >= 0 and c < len(self.map[0])

    def check_collision(self, x, y, radius):
        """
        Return True if a circle at (x,y) with given radius intersects any solid cell.
        Solid cells are those with value 1 or 2 (match JS semantics).
        Coordinates are world/pixel coordinates; margins are taken into account.
        """
        local_x = x - self.margin_left
        local_y = y - self.margin_top

        start_c = math.floor((local_x - radius) / self.cell_size)
        end_c = math.floor((local_x + radius) / self.cell_size)
        start_r = math.floor((local_y - radius) / self.cell_size)
        end_r = math.floor((local_y + radius) / self.cell_size)

        for r in range(start_r, end_r + 1):
            for c in range(start_c, end_c + 1):
                if not self.is_valid(r, c):
                    # out-of-bounds treated as solid
                    return True
                val = self.map[r][c]
                if val == 1 or val == 2:
                    cell_x = c * self.cell_size
                    cell_y = r * self.cell_size
                    if (local_x + radius > cell_x and local_x - radius < cell_x + self.cell_size and
                            local_y + radius > cell_y and local_y - radius < cell_y + self.cell_size):
                        return True

        return False
